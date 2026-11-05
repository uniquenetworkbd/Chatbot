// Public frontend configuration. Never place ADMIN_API_KEY in this file.
window.UNBD_API_BASE_URL = "";
export function getApiBaseUrl() {
  return String(window.UNBD_API_BASE_URL || "").replace(/\/+$/, "");
}
