// Public frontend configuration. Never place ADMIN_API_KEY in this file.
window.UNBD_API_BASE_URL = "";
export function getApiBaseUrl() {
  let codespacesUrl = "";
  try { codespacesUrl = sessionStorage.getItem("unbd-codespaces-api-url") || ""; } catch {}
  return String(window.UNBD_API_BASE_URL || codespacesUrl).replace(/\/+$/, "");
}
