import { getApiBaseUrl } from "./config.js";\nimport { authHeaders } from "./auth-session.js";

const make = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
function field(labelText, name, type = "text", options = {}) {
  const wrap = make("label", undefined, "network-field");
  const label = make("span", labelText, "network-field-label");
  let input;
  if (type === "select") {
    input = make("select");
    for (const [value, labelValue] of options.choices) {
      const option = make("option", labelValue);
      option.value = value;
      input.append(option);
    }
  } else {
    input = make("input");
    input.type = type;
  }
  input.name = name;
  input.autocomplete = options.autocomplete || "off";
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.value !== undefined) input.value = options.value;
  if (options.required) input.required = true;
  if (options.min !== undefined) input.min = options.min;
  if (options.max !== undefined) input.max = options.max;
  if (options.maxlength !== undefined) input.maxLength = options.maxlength;
  wrap.append(label, input);
  return { wrap, input };
}
function statusCard(title) {
  const card = make("section", undefined, "network-status-card");
  card.append(make("span", "CONNECTION STATUS", "network-status-eyebrow"), make("h3", title));
  const state = make("strong", "Not tested", "network-state");
  const details = make("p", "Run a connection test to see device status.", "network-status-detail");
  const model = make("p", "Device model: unknown", "network-status-model");
  card.append(state, details, model);
  return { card, state, details, model };
}
function renderStatus(card, result) {
  card.state.textContent = result.status === "online" ? "Online" : result.status === "offline" ? "Offline" : "Not tested";
  card.state.dataset.status = result.status;
  card.details.textContent = [result.check || "check unavailable", result.latencyMs == null ? "" : result.latencyMs + " ms"].filter(Boolean).join(" · ");
  card.model.textContent = "Device model: " + (result.model || "not reported");
  card.card.setAttribute("aria-label", result.status + " connection status");
}
export function initializeNetworkConfig(root) {
  if (!root || root.dataset.networkConfigReady === "true") return;
  root.dataset.networkConfigReady = "true";
  const intro = make("p", "Enter device details only for an on-demand connection test. Form values are held in this page's memory and are not saved to browser storage.", "page-intro");
  const security = make("div", "Admin authentication is required. Router username/password are never written to logs or SQLite. Router test currently checks TCP reachability only; it does not authenticate to RouterOS.", "network-security-note");
  const admin = make("section", undefined, "network-config-panel");
  admin.append(make("h2", "Backend authorization"));
  const keyField = field("ADMIN_API_KEY (session only)", "adminKey", "password", { required: true, autocomplete: "off", placeholder: "Enter backend admin key" });
  admin.append(keyField.wrap);

  const routerPanel = make("section", undefined, "network-config-panel");
  routerPanel.append(make("div", undefined, "network-panel-heading"));
  routerPanel.lastChild.append(make("div", "01 · ROUTER", "network-section-kicker"), make("h2", "MikroTik Router"));
  const routerGrid = make("div", undefined, "network-form-grid");
  const routerIp = field("Router IP Address", "ipAddress", "text", { required: true, placeholder: "192.168.88.1" });
  routerIp.input.inputMode = "decimal";
  const routerUser = field("API Username", "username", "text", { required: true, autocomplete: "username", placeholder: "Router API user", maxlength: 128 });
  const routerPass = field("API Password", "password", "password", { required: true, autocomplete: "new-password", placeholder: "Password is not saved", maxlength: 512 });
  const routerPort = field("API Port", "port", "select", { choices: [["8729", "8729 · API-SSL (recommended)"], ["8728", "8728 · API (unencrypted, reachability only)"]], value: "8729" });
  for (const item of [routerIp, routerUser, routerPass, routerPort]) routerGrid.append(item.wrap);
  const routerStatus = statusCard("MikroTik connection");
  const routerButton = make("button", "Test router TCP connection", "network-test-button");
  routerButton.type = "button";
  const routerNotice = make("p", "", "network-form-notice");
  routerPanel.append(routerGrid, routerButton, routerNotice, routerStatus.card);

  const oltPanel = make("section", undefined, "network-config-panel");
  oltPanel.append(make("div", undefined, "network-panel-heading"));
  oltPanel.lastChild.append(make("div", "02 · OPTICAL LINE TERMINAL", "network-section-kicker"), make("h2", "BDCOM / Generic OLT"));
  const oltGrid = make("div", undefined, "network-form-grid");
  const oltIp = field("OLT IP Address", "ipAddress", "text", { required: true, placeholder: "192.168.1.10" });
  oltIp.input.inputMode = "decimal";
  const community = field("SNMP Read Community", "community", "password", { required: true, autocomplete: "off", placeholder: "Community is not saved", maxlength: 128 });
  const snmpVersion = field("SNMP Version", "snmpVersion", "select", { choices: [["v2c", "SNMP v2c"], ["v3", "SNMP v3 (additional credentials required)"]] });
  const snmpPort = field("SNMP Agent Port", "port", "number", { value: "161", min: 1, max: 65535, required: true });
  for (const item of [oltIp, community, snmpVersion, snmpPort]) oltGrid.append(item.wrap);
  const oltStatus = statusCard("OLT SNMP connection");
  const oltButton = make("button", "Test SNMP connection", "network-test-button");
  oltButton.type = "button";
  const oltNotice = make("p", "SNMPv2c sends its community string without encryption. Use only on a trusted management network.", "network-form-notice");
  const v3Hint = make("p", "SNMPv3 requires security username, security level and authentication/privacy credentials. This form currently supports SNMPv2c testing only; v3 selection returns a clear not-tested response.", "network-form-notice");
  snmpVersion.input.addEventListener("change", () => { const v3 = snmpVersion.input.value === "v3"; community.input.disabled = v3; community.input.required = !v3; community.input.placeholder = v3 ? "Not used for SNMPv3" : "Community is not saved"; v3Hint.hidden = !v3; });
  v3Hint.hidden = true;
  oltPanel.append(oltGrid, v3Hint, oltButton, oltNotice, oltStatus.card);

  root.replaceChildren(make("h2", "Router & OLT Integration"), intro, security, routerPanel, oltPanel);

  async function request(payload, button, notice, status) {
    const base = getApiBaseUrl();
    if (!base) {
      notice.textContent = "Backend URL is not configured. Set UNBD_API_BASE_URL in js/config.js to your self-hosted HTTPS API origin.";
      return;
    }
    try {
      const parsed = new URL(base);
      const localHost = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
      if (parsed.protocol !== "https:" && !localHost) throw new Error("Device credentials may only be sent to an HTTPS backend (localhost is allowed for development).");
    } catch (error) { notice.textContent = error.message; return; }
    if (!keyField.input.value) {
      notice.textContent = "Enter the admin API key to authorize this test.";
      keyField.input.focus();
      return;
    }
    button.disabled = true;
    button.textContent = "Testing connection…";
    notice.textContent = "Request in progress. Secret fields will be cleared after this attempt.";
    try {
      const response = await fetch(base + "/api/network/connect-test", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
        cache: "no-store",
        credentials: "omit"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 422) throw new Error(data.error || "Connection test failed (HTTP " + response.status + ").");
      renderStatus(status, data);
      notice.textContent = data.notice || "Test completed.";
    } catch (error) {
      renderStatus(status, { status: "offline", check: "request_failed", model: "not available" });
      notice.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = payload.deviceType === "router" ? "Test router TCP connection" : "Test SNMP connection";
    }
  }

  routerButton.addEventListener("click", () => {
    if (!routerIp.input.value.trim() || !routerUser.input.value || !routerPass.input.value) {
      routerNotice.textContent = "Router IP, username and password fields are required.";
      return;
    }
    void request({
      deviceType: "router",
      ipAddress: routerIp.input.value.trim(),
      username: routerUser.input.value,
      password: routerPass.input.value,
      port: Number(routerPort.input.value)
    }, routerButton, routerNotice, routerStatus);
    routerPass.input.value = "";
  });

  oltButton.addEventListener("click", () => {
    if (!oltIp.input.value.trim() || (snmpVersion.input.value === "v2c" && !community.input.value)) {
      oltNotice.textContent = "OLT IP and SNMP community fields are required.";
      return;
    }
    void request({
      deviceType: "olt",
      ipAddress: oltIp.input.value.trim(),
      community: community.input.value,
      snmpVersion: snmpVersion.input.value,
      port: Number(snmpPort.input.value)
    }, oltButton, oltNotice, oltStatus);
    community.input.value = "";
  });
}
