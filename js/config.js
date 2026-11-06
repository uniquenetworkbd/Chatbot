// Public frontend configuration. Never place credentials or admin tokens here.
// For GitHub Pages production, set this to the stable HTTPS origin of the hosted API.
// Codespaces forwarded URLs are ephemeral and cannot be discovered securely from a
// separate GitHub Pages origin without a trusted discovery service.
window.UNBD_API_BASE_URL = window.UNBD_API_BASE_URL || "";

export function getApiBaseUrl() {
  const configured = String(
    window.UNBD_API_BASE_URL ||
    window.UNBD_RUNTIME_CONFIG?.API_BASE_URL ||
    ""
  ).trim();
  if (configured) return configured.replace(/\\/+$/, "");

  // When the frontend itself is opened inside Codespaces or locally, the API
  // can use the same origin. This does not discover a Codespace from GitHub Pages.
  const hostname = window.location.hostname;
  if (hostname.endsWith(".app.github.dev") || hostname === "localhost" || hostname === "127.0.0.1") {
    return window.location.origin.replace(/\\/+$/, "");
  }

  return "";
}
