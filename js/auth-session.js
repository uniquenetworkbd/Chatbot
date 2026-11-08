import { getApiBaseUrl } from "./config.js";

let sessionToken = "";
let currentAdmin = null;
export function getAuthToken() {
  return sessionToken;
}
export function authHeaders(extra = {}) {
  const headers = new Headers(extra);
  const token = getAuthToken();
  if (token) headers.set("Authorization", "Bearer " + token);
  return headers;
}
async function api(path, options = {}) {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("Backend is unavailable. Configure a stable HTTPS API endpoint for this deployment.");
  const response = await fetch(base + path, { ...options, headers: authHeaders(options.headers), cache: "no-store", credentials: "omit" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Authentication request failed (HTTP " + response.status + ").");
  return data;
}
function renderLogin(message = "") {
  document.body.classList.add("auth-required");
  document.getElementById("auth-gateway")?.remove();
  const shell = document.getElementById("app-shell");
  if (shell) shell.setAttribute("aria-hidden", "true");
  const root = document.createElement("main");
  root.id = "auth-gateway";
  root.className = "auth-gateway";
  const panel = document.createElement("section");
  panel.className = "auth-panel";
  const mark = document.createElement("div"); mark.className = "auth-brand-mark"; mark.textContent = "U";
  const eyebrow = document.createElement("p"); eyebrow.className = "auth-eyebrow"; eyebrow.textContent = "UNIQUE NETWORK BD · ADMIN";
  const title = document.createElement("h1"); title.textContent = "Secure Admin Login";
  const description = document.createElement("p"); description.textContent = "আপনার Admin Password দিয়ে নিরাপদে প্রবেশ করুন।";
  const form = document.createElement("form"); form.className = "auth-form";
  const passLabel = document.createElement("label"); passLabel.textContent = "Password";
  const pass = document.createElement("input"); pass.name = "password"; pass.type = "password"; pass.autocomplete = "current-password"; pass.required = true; pass.maxLength = 1024;
  passLabel.append(pass);
  const status = document.createElement("p"); status.className = "auth-message"; status.setAttribute("role", "status"); status.textContent = message;
  const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = "Login";
  form.append(passLabel, status, submit);
  const foot = document.createElement("small"); foot.textContent = "Secure session · 8-hour expiry · This device tab only";
  panel.append(mark, eyebrow, title, description, form, foot); root.append(panel); document.body.append(root);
  form.addEventListener("submit", async event => {
    event.preventDefault(); submit.disabled = true; status.textContent = "Verifying credentials…";
    try {
      const data = await api("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pass.value }) });
      sessionToken = data.token;
      currentAdmin = data.admin;
      pass.value = "";
      root.remove(); document.body.classList.remove("auth-required");
      if (shell) shell.removeAttribute("aria-hidden");
      const { initializeNavigation } = await import("./navigation.js");
      initializeNavigation();
    } catch (error) { pass.value = ""; status.textContent = error.message; }
    finally { submit.disabled = false; }
  });
}
export async function ensureAuthenticated() {
  const base = await getApiBaseUrl(), token = getAuthToken();
  if (!base) { renderLogin("Backend সংযোগ বর্তমানে পাওয়া যাচ্ছে না। Backend configuration যাচাই করুন।"); return false; }
  if (!token) { renderLogin(); return false; }
  try {
    const data = await api("/api/auth/session");
    currentAdmin = data.admin;
    document.body.classList.remove("auth-required");
    const shell = document.getElementById("app-shell"); shell?.removeAttribute("aria-hidden");
    return true;
  } catch {
    sessionToken = "";
    renderLogin("Your session expired. Please log in again.");
    return false;
  }
}
export async function logout() {
  const token = getAuthToken();
  try { if (token) await api("/api/auth/logout", { method: "POST" }); } catch {}
  sessionToken = "";
  currentAdmin = null;
  window.location.replace("./index.html");
}
export function initializeAuthControls() {
  if (!getAuthToken()) return;
  const topbar = document.querySelector(".topbar");
  if (!topbar || document.getElementById("logout-button")) return;
  const button = document.createElement("button");
  button.id = "logout-button"; button.type = "button"; button.className = "icon-button logout-button"; button.textContent = "Log Out";
  button.addEventListener("click", () => { void logout(); });
  topbar.append(button);
}
