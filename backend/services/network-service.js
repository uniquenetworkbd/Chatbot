const net = require("node:net");

function loadTargets() {
  const raw = process.env.NETWORK_TARGETS_JSON || "[]";
  let targets;
  try { targets = JSON.parse(raw); } catch { throw new Error("NETWORK_TARGETS_JSON must be valid JSON."); }
  if (!Array.isArray(targets) || targets.length > 20) throw new Error("NETWORK_TARGETS_JSON must be an array of at most 20 targets.");
  return targets.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid network target at index " + index);
    const { id, label, host, port, type } = item;
    if (![id,label,host].every(x => typeof x === "string" && x.trim()) ||
        !Number.isInteger(port) || port < 1 || port > 65535 ||
        !["mikrotik","bdcom_olt","generic"].includes(type)) throw new Error("Invalid network target at index " + index);
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || !/^[a-zA-Z0-9.-]{1,253}$/.test(host)) throw new Error("Invalid target identifier or host.");
    return { id, label: label.slice(0,80), host, port, type };
  });
}

function probeTcp(target, timeoutMs = 1800) {
  return new Promise(resolve => {
    const started = process.hrtime.bigint();
    const socket = net.createConnection({ host: target.host, port: target.port });
    let settled = false;
    const finish = status => {
      if (settled) return;
      settled = true;
      const latencyMs = Number((Number(process.hrtime.bigint() - started) / 1e6).toFixed(1));
      socket.destroy();
      resolve({ id: target.id, label: target.label, type: target.type, status, latencyMs: status === "online" ? latencyMs : null, check: "TCP connect", endpoint: target.host + ":" + target.port });
    };
    socket.setTimeout(timeoutMs, () => finish("timeout"));
    socket.once("connect", () => finish("online"));
    socket.once("error", () => finish("offline"));
  });
}

async function getNetworkStatus() {
  const targets = loadTargets();
  if (!targets.length) {
    return {
      mode: "simulated",
      checkedAt: new Date().toISOString(),
      notice: "ডেমো ডেটা—কোনো MikroTik বা BDCOM ডিভাইসে সংযোগ করা হয়নি।",
      devices: [
        { id: "demo-router", label: "MikroTik Core Router (Demo)", type: "mikrotik", status: "simulated", latencyMs: 4.8, check: "simulated", endpoint: null },
        { id: "demo-olt", label: "BDCOM OLT (Demo)", type: "bdcom_olt", status: "simulated", latencyMs: 8.2, check: "simulated", endpoint: null }
      ],
      bandwidth: { mode: "simulated", downloadMbps: 72.4, uploadMbps: 18.6, utilizationPercent: 38 }
    };
  }
  const devices = await Promise.all(targets.map(target => probeTcp(target)));
  return {
    mode: "live_tcp",
    checkedAt: new Date().toISOString(),
    notice: "লাইভ ফলাফল শুধু allowlisted TCP port reachability ও connect latency। এটি ICMP ping, RouterOS API authentication, OLT optical RX/TX বা bandwidth counter নয়।",
    devices,
    bandwidth: null
  };
}
module.exports = { getNetworkStatus, loadTargets, probeTcp };
