import process from "node:process";

const port = 3000;
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const codespace = process.env.CODESPACE_NAME;
const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev";
const apiBase = `https://${codespace}-${port}.${domain}`;
const manifestPath = "backend-url.json";
const apiRoot = process.env.GITHUB_API_URL || "https://api.github.com";

function fail(message) {
  console.error(`[codespaces-discovery] ${message}`);
  process.exitCode = 1;
}

if (!repository || !token || !codespace || !/^[a-z0-9.-]+$/i.test(domain)) {
  fail("Missing GITHUB_REPOSITORY, GITHUB_TOKEN, CODESPACE_NAME, or valid forwarding domain. Ensure Codespaces token has Contents: Read and write permission.");
} else {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };

  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(15000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = body.message || `HTTP ${response.status}`;
      throw new Error(`${detail}. Check Codespaces GITHUB_TOKEN repository Contents write permission.`);
    }
    return body;
  }

  async function waitForBackend() {
    const healthUrl = `${apiBase}/api/health`;
    for (let attempt = 1; attempt <= 45; attempt += 1) {
      try {
        const response = await fetch(healthUrl, { cache: "no-store", signal: AbortSignal.timeout(4000) });
        const health = await response.json();
        if (response.ok && health.status === "ok" && health.database === "ok") return;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error("Backend health check did not become healthy within 90 seconds; discovery file was not updated.");
  }

  try {
    await waitForBackend();
    const [owner, repo] = repository.split("/");
    if (!owner || !repo) throw new Error("GITHUB_REPOSITORY must be owner/repository.");
    const endpoint = `${apiRoot}/repos/${owner}/${repo}/contents/${manifestPath}`;
    let existing = null;
    try {
      existing = await request(`${endpoint}?ref=main`);
    } catch (error) {
      if (!String(error.message).includes("Not Found")) throw error;
    }

    const now = new Date();
    const manifest = {
      schemaVersion: 1,
      status: "active",
      url: apiBase,
      port,
      codespace,
      updatedAt: now.toISOString(),
      // Health-check validation on the frontend is authoritative; this is a stale-record guard.
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    const payload = {
      message: "chore: publish active Codespaces backend URL",
      content: Buffer.from(JSON.stringify(manifest, null, 2) + "\n").toString("base64"),
      branch: "main"
    };
    if (existing?.sha) payload.sha = existing.sha;
    await request(endpoint, { method: "PUT", body: JSON.stringify(payload) });
    console.log(`[codespaces-discovery] Published healthy backend endpoint for ${codespace} to ${repository}/${manifestPath}.`);
  } catch (error) {
    fail(error.message);
  }
}
