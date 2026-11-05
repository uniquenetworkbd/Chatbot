const express = require("express");
const net = require("node:net");
const dgram = require("node:dgram");
const tls = require("node:tls");
const { randomInt } = require("node:crypto");
const { requireAdmin } = require("../middleware/security");
const rateLimit = require("express-rate-limit");

const router = express.Router();
const TIMEOUT_MS = 4500;
const MAX_COMMUNITY_BYTES = 128;
const PORTS = { router: new Set([8728, 8729]), olt: new Set([161]) };
const probeLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Network probe limit reached; retry later." } });

function validIp(value) {
  return typeof value === "string" && net.isIP(value) !== 0;
}
function cleanString(value, max, optional = false) {
  return typeof value === "string" && (optional && value.length === 0 || value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value));
}
function tcpProbe(host, port) {
  return new Promise(resolve => {
    const started = Date.now();
    const socket = net.createConnection({ host, port });
    let done = false;
    const finish = result => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ ...result, latencyMs: Date.now() - started });
    };
    socket.setTimeout(TIMEOUT_MS);
    socket.once("connect", () => finish({ online: true, check: "tcp_reachable" }));
    socket.once("timeout", () => finish({ online: false, check: "timeout" }));
    socket.once("error", error => finish({ online: false, check: error.code === "ECONNREFUSED" ? "connection_refused" : "unreachable" }));
  });
}
function encodeApiLength(length) {
  if (length < 0x80) return Buffer.from([length]);
  if (length < 0x4000) return Buffer.from([(length >> 8) | 0x80, length & 0xff]);
  if (length < 0x200000) return Buffer.from([(length >> 16) | 0xc0, (length >> 8) & 0xff, length & 0xff]);
  if (length < 0x10000000) return Buffer.from([(length >> 24) | 0xe0, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
  const b = Buffer.alloc(5); b[0] = 0xf0; b.writeUInt32BE(length, 1); return b;
}
function decodeApiLength(buffer, offset) {
  if (offset >= buffer.length) return null;
  const first = buffer[offset];
  if (first < 0x80) return { length: first, next: offset + 1 };
  if ((first & 0xc0) === 0x80) {
    if (offset + 2 > buffer.length) return null;
    return { length: ((first & 0x3f) << 8) | buffer[offset + 1], next: offset + 2 };
  }
  if ((first & 0xe0) === 0xc0) {
    if (offset + 3 > buffer.length) return null;
    return { length: ((first & 0x1f) << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2], next: offset + 3 };
  }
  if ((first & 0xf0) === 0xe0) {
    if (offset + 4 > buffer.length) return null;
    return { length: ((first & 0x0f) * 0x1000000) + (buffer[offset + 1] << 16) + (buffer[offset + 2] << 8) + buffer[offset + 3], next: offset + 4 };
  }
  if (first === 0xf0) {
    if (offset + 5 > buffer.length) return null;
    return { length: buffer.readUInt32BE(offset + 1), next: offset + 5 };
  }
  throw new Error("Invalid RouterOS API length prefix");
}
function writeApiSentence(socket, words) {
  const chunks = [];
  for (const word of words) {
    const bytes = Buffer.from(word, "utf8");
    chunks.push(encodeApiLength(bytes.length), bytes);
  }
  chunks.push(Buffer.from([0]));
  socket.write(Buffer.concat(chunks));
}
function createApiSentenceReader(socket) {
  let buffer = Buffer.alloc(0), failure = null;
  const waiters = [];
  socket.on("data", chunk => { buffer = Buffer.concat([buffer, chunk]); while (waiters.length) waiters.shift()(); });
  socket.on("error", error => { failure = error; while (waiters.length) waiters.shift()(); });
  return function nextSentence(timeoutMs = TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      let timer;
      const attempt = () => {
        if (failure) { clearTimeout(timer); reject(failure); return; }
        let offset = 0; const words = [];
        while (offset < buffer.length) {
          const decoded = decodeApiLength(buffer, offset);
          if (!decoded) break;
          if (decoded.length === 0) {
            buffer = buffer.subarray(decoded.next);
            clearTimeout(timer); resolve(words); return;
          }
          if (decoded.next + decoded.length > buffer.length) break;
          words.push(buffer.subarray(decoded.next, decoded.next + decoded.length).toString("utf8"));
          offset = decoded.next + decoded.length;
        }
        if (offset > 0) buffer = buffer.subarray(offset);
        timer = setTimeout(() => {
          const index = waiters.indexOf(attempt); if (index >= 0) waiters.splice(index, 1);
          reject(new Error("RouterOS API response timeout"));
        }, timeoutMs);
        waiters.push(attempt);
      };
      attempt();
    });
  };
}
function parseApiAttributes(words) {
  const result = {};
  for (const word of words) if (word.startsWith("=")) {
    const split = word.indexOf("=", 1);
    if (split > 1) result[word.slice(1, split)] = word.slice(split + 1);
  }
  return result;
}
async function routerApiSslProbe(host, port, username, password) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, rejectUnauthorized: true, minVersion: "TLSv1.2", ...(net.isIP(host) ? {} : { servername: host }) });
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("RouterOS API-SSL handshake timeout")); }, TIMEOUT_MS * 3);
    socket.once("error", error => { clearTimeout(timer); reject(new Error(error.code === "CERT_HAS_EXPIRED" || error.code === "DEPTH_ZERO_SELF_SIGNED_CERT" || error.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ? "Router API-SSL certificate is not trusted" : "Router API-SSL connection failed")); });
    socket.once("secureConnect", async () => {
      try {
        const nextSentence = createApiSentenceReader(socket);
        writeApiSentence(socket, ["/login", "=name=" + username, "=password=" + password]);
        let reply = await nextSentence();
        if (reply.includes("!trap") || reply.includes("!fatal")) throw new Error("RouterOS authentication failed");
        if (!reply.includes("!done")) throw new Error("RouterOS login response was not recognized");
        writeApiSentence(socket, ["/system/resource/print"]);
        const records = [];
        for (let i = 0; i < 20; i++) {
          reply = await nextSentence();
          if (reply.includes("!trap") || reply.includes("!fatal")) throw new Error("RouterOS resource query was rejected");
          if (reply.includes("!re")) records.push(parseApiAttributes(reply));
          if (reply.includes("!done")) break;
        }
        const info = records[0] || {};
        clearTimeout(timer); socket.end();
        resolve({ online: true, authentication: "authenticated", check: "routeros_api_ssl_authenticated", model: info["board-name"] || "RouterOS device", version: info.version || "unknown" });
      } catch (error) { clearTimeout(timer); socket.destroy(); reject(error); }
    });
  });
}
function berLength(n) {
  if (n < 128) return Buffer.from([n]);
  const bytes = [];
  while (n) { bytes.unshift(n & 255); n >>>= 8; }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
function tlv(tag, value) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return Buffer.concat([Buffer.from([tag]), berLength(body.length), body]);
}
function berInteger(value) {
  let n = value >>> 0;
  const bytes = [n & 255];
  while ((n >>>= 8) > 0) bytes.unshift(n & 255);
  if (bytes[0] & 0x80) bytes.unshift(0);
  return tlv(0x02, Buffer.from(bytes));
}
function oidBytes(oid) {
  const parts = oid.split(".").map(Number);
  const out = [parts[0] * 40 + parts[1]];
  for (const part of parts.slice(2)) {
    let n = part, encoded = [n & 0x7f];
    while ((n = Math.floor(n / 128)) > 0) encoded.unshift((n & 0x7f) | 0x80);
    out.push(...encoded);
  }
  return tlv(0x06, Buffer.from(out));
}
function snmpV2Get(community) {
  const requestId = randomInt(1, 0x7fffffff);
  const variable = tlv(0x30, Buffer.concat([oidBytes("1.3.6.1.2.1.1.1.0"), tlv(0x05, Buffer.alloc(0))]));
  const varbinds = tlv(0x30, variable);
  const pdu = tlv(0xa0, Buffer.concat([berInteger(requestId), berInteger(0), berInteger(0), varbinds]));
  return tlv(0x30, Buffer.concat([berInteger(1), tlv(0x04, community), pdu]));
}
function readTlv(buffer, offset) {
  if (offset + 2 > buffer.length) throw new Error("Malformed SNMP response");
  const tag = buffer[offset++];
  let length = buffer[offset++];
  if (length & 0x80) { const count = length & 0x7f; if (!count || count > 4 || offset + count > buffer.length) throw new Error("Malformed SNMP length"); length = 0; for (let i = 0; i < count; i++) length = length * 256 + buffer[offset++]; }
  const end = offset + length;
  if (end > buffer.length) throw new Error("Truncated SNMP response");
  return { tag, start: offset, end, next: end };
}
function parseSysDescr(message, expectedCommunity) {
  const root = readTlv(message, 0); if (root.tag !== 0x30) throw new Error("Not an SNMP sequence");
  const version = readTlv(message, root.start); if (version.tag !== 0x02 || message[version.start] !== 1) throw new Error("Unexpected SNMP version");
  const community = readTlv(message, version.next); if (community.tag !== 0x04 || !message.subarray(community.start, community.end).equals(Buffer.from(expectedCommunity))) throw new Error("SNMP community mismatch");
  const pdu = readTlv(message, community.next); if (pdu.tag !== 0xa2) throw new Error("Not an SNMP GetResponse");
  const requestId = readTlv(message, pdu.start);
  const errorStatus = readTlv(message, requestId.next); if (errorStatus.tag !== 0x02 || message[errorStatus.start] !== 0) throw new Error("SNMP agent returned an error");
  const errorIndex = readTlv(message, errorStatus.next);
  const varbinds = readTlv(message, errorIndex.next); if (varbinds.tag !== 0x30) throw new Error("SNMP varbind list missing");
  const binding = readTlv(message, varbinds.start); if (binding.tag !== 0x30) throw new Error("SNMP varbind missing");
  const oid = readTlv(message, binding.start);
  const value = readTlv(message, oid.next);
  if (value.tag !== 0x04) return "SNMP sysDescr returned a non-text value";
  return message.subarray(value.start, value.end).toString("utf8").replace(/[\\u0000-\\u001f\\u007f]/g, " ").slice(0, 180) || "SNMP device responded";
}
function snmpProbe(host, port, community) {
  return new Promise(resolve => {
    const socket = dgram.createSocket(net.isIP(host) === 6 ? "udp6" : "udp4");
    const started = Date.now();
    let done = false;
    const finish = result => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve({ ...result, latencyMs: Date.now() - started });
    };
    const timer = setTimeout(() => finish({ online: false, check: "snmp_timeout" }), TIMEOUT_MS);
    socket.once("error", () => finish({ online: false, check: "snmp_unreachable" }));
    socket.on("message", (message, remote) => {
      if (remote.port !== port || remote.address !== host || message.length < 8 || message[0] !== 0x30) return;
      try { finish({ online: true, check: "snmp_v2c_response", model: parseSysDescr(message, community) }); }
      catch { finish({ online: false, check: "snmp_invalid_response", model: "Invalid SNMP response" }); }
    });
    socket.send(snmpV2Get(community), port, host, error => {
      if (error) finish({ online: false, check: "snmp_send_failed" });
    });
  });
}

router.post("/connect-test", requireAdmin, probeLimiter, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const body = req.body || {};
  const deviceType = body.deviceType;
  const host = body.ipAddress;
  const port = Number(body.port);
  if (!["router", "olt"].includes(deviceType) || !validIp(host) ||
      !Number.isInteger(port) || !PORTS[deviceType].has(port)) {
    return res.status(400).json({ error: "Invalid device type, IP address, or allowed port." });
  }

  if (deviceType === "router") {
    if (!cleanString(body.username, 128) || !cleanString(body.password, 512)) {
      return res.status(400).json({ error: "Router username and password are required for configuration validation." });
    }
    if (port === 8728) {
      const result = await tcpProbe(host, port);
      return res.status(200).json({
        deviceType, status: result.online ? "online" : "offline",
        check: result.check, latencyMs: result.latencyMs,
        authentication: "not_tested",
        model: "RouterOS model is unavailable from a plain TCP probe",
        notice: "Port 8728 is unencrypted. Credentials were not transmitted or stored; only TCP reachability was checked. Use API-SSL port 8729 for authenticated tests."
      });
    }
    try {
      const started = Date.now();
      const result = await routerApiSslProbe(host, port, body.username, body.password);
      return res.status(200).json({
        deviceType, status: "online", check: result.check,
        authentication: result.authentication, latencyMs: Date.now() - started,
        model: result.model, version: result.version,
        notice: "TLS certificate validation and RouterOS API login succeeded. Credentials were used for this request only and were not logged or persisted."
      });
    } catch (error) {
      return res.status(200).json({
        deviceType, status: "offline", check: "routeros_api_ssl_failed",
        authentication: "failed_or_unavailable", model: "RouterOS identity unavailable",
        notice: error.message
      });
    }
  }

  const version = body.snmpVersion;
  if (version === "v3") {
    return res.status(422).json({
      deviceType, status: "not_tested", check: "snmp_v3_not_configured",
      notice: "SNMPv3 requires security username, security level, authentication protocol/passphrase and optional privacy protocol/passphrase. Those fields are not part of this form; no v3 probe was attempted."
    });
  }
  const community = body.community;
  if (version !== "v2c" || !cleanString(community, MAX_COMMUNITY_BYTES)) {
    return res.status(400).json({ error: "SNMPv2c requires a community string of 1–128 characters." });
  }
  const result = await snmpProbe(host, port, community);
  return res.status(200).json({
    deviceType, status: result.online ? "online" : "offline",
    check: result.check, latencyMs: result.latencyMs,
    model: result.model || "No SNMP response",
    notice: "SNMPv2c community is sent over UDP without encryption. Use only on a trusted management network; prefer SNMPv3 when fully configured."
  });
});

module.exports = () => router;
