// Public frontend configuration. Never place credentials or admin tokens here.
window.UNBD_API_BASE_URL = window.UNBD_API_BASE_URL || "";

const DISCOVERY_URL = "https://raw.githubusercontent.com/uniquenetworkbd/Chatbot/main/backend-url.json";
const DISCOVERY_RETRY_MS = 10000;
let apiBasePromise = null;
let apiBaseCheckedAt = 0;

function normalizeBase(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
}

async function isHealthy(base) {
  if (!base) return false;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(base + "/api/health", {
      method: "GET", cache: "no-store", credentials: "omit", signal: controller.signal
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data.status === "ok" && data.database === "ok" && data.service === "unique-network-chatbot-api" && data.schemaVersion === 5;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

async function discoverBackend() {
  const configured = normalizeBase(
    window.UNBD_API_BASE_URL || window.UNBD_RUNTIME_CONFIG?.API_BASE_URL || ""
  );
  if (configured && await isHealthy(configured)) return configured;

  try {
    const response = await fetch(DISCOVERY_URL + "?v=" + Date.now(), {
      method: "GET", cache: "no-store", mode: "cors", credentials: "omit"
    });
    if (response.ok) {
      const manifest = await response.json();
      const discovered = normalizeBase(manifest.url);
      const expiresAt = Date.parse(manifest.expiresAt || "");
      const validCodespacesHost = discovered &&
        /^https:\/\/[a-z0-9-]+-3000\.app\.github\.dev$/i.test(discovered);
      if (
        manifest.schemaVersion === 1 &&
        manifest.status === "active" &&
        validCodespacesHost &&
        Number.isFinite(expiresAt) &&
        expiresAt > Date.now() &&
        await isHealthy(discovered)
      ) return discovered;
    }
  } catch (error) {
    console.warn("GitHub backend discovery is unavailable; retry will occur automatically.", error);
  }

  const hostname = window.location.hostname;
  if (hostname.endsWith(".app.github.dev") || hostname === "localhost" || hostname === "127.0.0.1") {
    const sameOrigin = normalizeBase(window.location.origin);
    if (await isHealthy(sameOrigin)) return sameOrigin;
  }
  return "";
}

// A failed/offline lookup is cached only briefly. This lets the UI reconnect
// automatically after a Codespace resumes without requiring a page reload.
export function getApiBaseUrl() {
  if (apiBasePromise && Date.now() - apiBaseCheckedAt < DISCOVERY_RETRY_MS) {
    return apiBasePromise;
  }
  apiBaseCheckedAt = Date.now();
  apiBasePromise = discoverBackend().catch(error => {
    console.warn("Backend discovery failed; retrying shortly.", error);
    return "";
  });
  return apiBasePromise;
}
