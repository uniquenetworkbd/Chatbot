const express = require("express");
const net = require("node:net");
const dgram = require("node:dgram");
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
    // Credentials are deliberately not used for this reachability probe, logged, or persisted.
    const result = await tcpProbe(host, port);
    return res.status(200).json({
      deviceType, status: result.online ? "online" : "offline",
      check: result.check, latencyMs: result.latencyMs,
      authentication: "not_tested",
      model: "RouterOS model is unavailable from a TCP-only probe",
      notice: "TCP reachability only. RouterOS credentials were not transmitted to the router and were not stored. Use API-SSL (8729); authenticated RouterOS API integration is a separate step."
    });
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
