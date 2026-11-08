import { DOCUMENTS, getKnowledgeStats } from "./knowledge/index.js";
import { getApiBaseUrl } from "./config.js";

const $ = (tag, className = "", text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};
const words = value => String(value ?? "").trim().split(/\s+/u).filter(Boolean).length;
const label = value => ({ company: "Company", internet: "Internet", billing: "Billing", security: "Security" }[value] || value || "Uncategorized");
const pct = (n, total) => total ? Math.round(n / total * 100) : 0;

function statCard(name, value, note) {
  const card = $("article", "profile-stat");
  card.append($("span", "", name), $("strong", "", value), $("small", "", note));
  return card;
}
function panel(title, subtitle = "") {
  const node = $("section", "profile-section");
  const head = $("div", "profile-section-head");
  const text = $("div");
  text.append($("h2", "", title));
  if (subtitle) text.append($("p", "", subtitle));
  head.append(text);
  node.append(head);
  return node;
}
function progressPanel(title, rows) {
  const box = $("article", "profile-panel");
  box.append($("h3", "", title));
  rows.forEach(row => {
    const line = $("div", "profile-progress-row");
    line.append($("span", "", row.label), $("strong", "", row.value + "%"));
    const track = $("div", "profile-progress"), fill = $("span");
    fill.style.width = row.value + "%";
    track.append(fill);
    box.append(line, track);
  });
  return box;
}
function createPreview(doc) {
  const dialog = $("dialog", "profile-doc-preview");
  dialog.setAttribute("aria-label", "Document preview");
  const head = $("div", "profile-preview-head");
  const close = $("button", "profile-button", "বন্ধ করুন");
  close.type = "button";
  close.addEventListener("click", () => dialog.close());
  head.append($("h2", "", doc.id || "Knowledge document"), close);
  const meta = $("p", "profile-note", label(doc.category) + " · " + (doc.keywords?.length || 0) + " keywords · " + words(doc.response) + " response words");
  const body = $("div", "profile-preview-body", doc.response || "এই ডকুমেন্টে response content নেই।");
  const keywordTitle = $("h3", "", "Keywords");
  const keywords = $("div", "profile-preview-keywords");
  (doc.keywords || []).forEach(word => keywords.append($("span", "profile-chip", word)));
  dialog.append(head, meta, body, keywordTitle, keywords);
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  return dialog;
}

function renderDocuments(root, docs) {
  const tools = $("div", "profile-doc-tools");
  const search = $("input", "profile-search");
  const filter = $("select", "profile-filter");
  search.type = "search";
  search.placeholder = "ডকুমেন্টের নাম, ID বা keyword খুঁজুন";
  search.setAttribute("aria-label", "Search documents");
  filter.setAttribute("aria-label", "Filter documents by category");
  [["all", "সব ক্যাটাগরি"], ...[...new Set(docs.map(d => d.category))].map(c => [c, label(c)])]
    .forEach(([value, text]) => { const option = $("option", "", text); option.value = value; filter.append(option); });
  tools.append(search, filter);
  const count = $("p", "profile-note", "");
  const list = $("div", "profile-doc-list");
  const pager = $("div", "profile-pagination");
  const previous = $("button", "profile-button", "আগের");
  const next = $("button", "profile-button", "পরের");
  const pageText = $("span", "profile-note", "");
  previous.type = next.type = "button";
  const pageSize = 30;
  let page = 0, filtered = docs;
  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    const selected = filter.value;
    filtered = docs.filter(doc => (selected === "all" || doc.category === selected) &&
      [doc.id, doc.category, ...(doc.keywords || []), doc.response].join(" ").toLocaleLowerCase().includes(query));
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(page, pages - 1);
    count.textContent = filtered.length + "টি document পাওয়া গেছে";
    pageText.textContent = (page + 1) + " / " + pages;
    previous.disabled = page === 0;
    next.disabled = page >= pages - 1;
    list.replaceChildren();
    if (!filtered.length) { list.append($("div", "profile-empty", "কোনো matching document পাওয়া যায়নি।")); return; }
    filtered.slice(page * pageSize, (page + 1) * pageSize).forEach(doc => {
      const item = $("article", "profile-doc"), details = $("div");
      const response = String(doc.response ?? "");
      const heading = $("h3", "", doc.id || "Unnamed document");
      const desc = $("p", "", response.slice(0, 150) + (response.length > 150 ? "…" : ""));
      const meta = $("div", "profile-doc-meta");
      meta.append($("span", "profile-chip", label(doc.category)),
        $("span", "profile-chip", (doc.keywords || []).length + " keywords"),
        $("span", "profile-chip", words(response) + " response words"));
      details.append(heading, desc, meta);
      const button = $("button", "profile-button", "Preview ↗");
      button.type = "button";
      button.addEventListener("click", () => {
        const dialog = createPreview(doc);
        document.body.append(dialog);
        dialog.addEventListener("close", () => dialog.remove(), { once: true });
        dialog.showModal();
      });
      item.append(details, button);
      list.append(item);
    });
  }
  search.addEventListener("input", () => { page = 0; render(); });
  filter.addEventListener("change", () => { page = 0; render(); });
  previous.addEventListener("click", () => { page--; render(); });
  next.addEventListener("click", () => { page++; render(); });
  pager.append(previous, pageText, next);
  render();
  root.append(tools, count, list, pager);
}

function renderQuality(root, docs) {
  const missingId = docs.filter(d => !String(d.id ?? "").trim()).length;
  const missingCategory = docs.filter(d => !String(d.category ?? "").trim()).length;
  const missingKeywords = docs.filter(d => !Array.isArray(d.keywords) || !d.keywords.length).length;
  const missingResponse = docs.filter(d => !String(d.response ?? "").trim()).length;
  const ids = docs.map(d => String(d.id ?? "").trim().toLowerCase()).filter(Boolean);
  const duplicateIds = ids.length - new Set(ids).size;
  const responseLengths = docs.map(d => words(d.response)).filter(Boolean);
  const avgWords = responseLengths.length ? Math.round(responseLengths.reduce((a, b) => a + b, 0) / responseLengths.length) : 0;
  const quality = panel("Document Quality & Response Metrics", "Loaded knowledge records-এর structural checks; semantic correctness স্বয়ংক্রিয়ভাবে প্রমাণ করে না।");
  const grid = $("div", "profile-grid");
  grid.append(
    statCard("Missing ID", missingId, "Required field check"),
    statCard("Missing category", missingCategory, "Required field check"),
    statCard("Missing keywords", missingKeywords, "Search metadata check"),
    statCard("Missing response", missingResponse, "Empty response check"),
    statCard("Duplicate IDs", duplicateIds, "Exact normalized ID duplicates"),
    statCard("Avg. response words", avgWords, "Non-empty responses only"),
    statCard("Keyword coverage", pct(docs.filter(d => d.keywords?.length).length, docs.length) + "%", "Documents with keywords"),
    statCard("Response coverage", pct(responseLengths.length, docs.length) + "%", "Documents with response text")
  );
  quality.append(grid);
  const note = $("p", "profile-note", "এগুলো local source-data validation। Duplicate response content, factual accuracy, completeness of business facts বা chatbot answer success এই metrics দিয়ে যাচাই করা হয় না।");
  quality.append(note);
  root.append(quality);
  return { missingId, missingCategory, missingKeywords, missingResponse, duplicateIds, avgWords };
}

async function renderLiveMonitoring(root) {
  const section = panel("Live System & API Monitor", "শুধু browser থেকে বাস্তবে পাওয়া HTTP response এখানে দেখানো হবে।");
  const status = $("span", "profile-status", "Backend health পরীক্ষা হচ্ছে…");
  status.dataset.state = "checking";
  section.append(status);
  const grid = $("div", "profile-backend-list");
  const healthCard = $("article", "profile-backend-item");
  healthCard.append($("strong", "", "GET /api/health"), $("span", "", "Public health endpoint"), $("span", "", "Waiting for live request"));
  grid.append(healthCard);
  const deploymentCard = $("article", "profile-backend-item");
  deploymentCard.append($("strong", "", "GitHub deployment"), $("span", "", "Latest commit / workflow metadata"), $("span", "", "Fetching GitHub public API…"));
  grid.append(deploymentCard);
  section.append(grid);
  const note = $("p", "profile-note", "Admin-protected API endpoints browser থেকে credentials ছাড়া probe করা হয় না। Runtime uptime/memory metrics health API সরবরাহ না করলে unknown থাকবে।");
  section.append(note);
  root.append(section);

  try {
    const base = await getApiBaseUrl();
    if (!base) throw new Error("No healthy backend URL discovered");
    const started = performance.now();
    const response = await fetch(base + "/api/health", { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(8000) });
    const elapsed = Math.round(performance.now() - started);
    const data = await response.json();
    if (!response.ok || data.status !== "ok" || data.database !== "ok") throw new Error("Health response is not healthy");
    status.textContent = "LIVE · Backend healthy · Database " + data.database;
    status.dataset.state = "online";
    healthCard.replaceChildren(
      $("strong", "", "GET /api/health · HTTP " + response.status),
      $("span", "", "Response " + elapsed + " ms · Database " + data.database),
      $("span", "", "Schema v" + (data.schemaVersion ?? "unknown") + " · DB bytes " + (data.storage?.fileBytes ?? "unknown")),
      $("span", "", "Server timestamp " + (data.timestamp || "not supplied"))
    );
  } catch (error) {
    status.textContent = "NOT CONFIRMED · Backend offline or unreachable";
    status.dataset.state = "offline";
    healthCard.replaceChildren($("strong", "", "GET /api/health · NOT CONFIRMED"),
      $("span", "", "No successful live health response"),
      $("span", "", String(error?.message || "Request failed").slice(0, 180)));
  }

  try {
    const [commitResponse, runsResponse] = await Promise.all([
      fetch("https://api.github.com/repos/uniquenetworkbd/Chatbot/commits/main", { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" }),
      fetch("https://api.github.com/repos/uniquenetworkbd/Chatbot/actions/runs?per_page=1", { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" })
    ]);
    if (!commitResponse.ok || !runsResponse.ok) throw new Error("GitHub API returned HTTP error");
    const [commit, runs] = await Promise.all([commitResponse.json(), runsResponse.json()]);
    const run = runs.workflow_runs?.[0];
    deploymentCard.replaceChildren(
      $("strong", "", "Latest main commit · " + String(commit.sha || "").slice(0, 7)),
      $("span", "", safe(commit.commit?.message).split("\n")[0]),
      $("span", "", "Committed " + (commit.commit?.committer?.date || "unknown")),
      $("span", "", run ? "Latest workflow: " + run.status + (run.conclusion ? " / " + run.conclusion : "") : "No workflow run found"),
      $("span", "", run?.html_url || "Workflow URL unavailable")
    );
    deploymentCard.dataset.state = run?.conclusion === "success" ? "success" : "unknown";
  } catch (error) {
    deploymentCard.replaceChildren($("strong", "", "GitHub deployment metadata · UNKNOWN"),
      $("span", "", String(error?.message || "GitHub API unavailable").slice(0, 180)));
    deploymentCard.dataset.state = "unknown";
  }
}

export function initializeProfilePage(root) {
  const stats = getKnowledgeStats(), docs = DOCUMENTS;
  const complete = docs.filter(doc => Boolean(doc.id && doc.category && Array.isArray(doc.keywords) && doc.keywords.length && typeof doc.response === "string" && doc.response.trim())).length;
  const completeness = pct(complete, docs.length);
  const categories = new Map();
  docs.forEach(doc => categories.set(doc.category, (categories.get(doc.category) || 0) + 1));
  const totalKeywords = docs.reduce((sum, doc) => sum + (doc.keywords?.length || 0), 0);
  const totalWords = docs.reduce((sum, doc) => sum + words(doc.response), 0);

  const hero = $("section", "profile-hero"), brand = $("div", "profile-brand");
  brand.append($("div", "profile-avatar", "U"));
  const brandText = $("div");
  brandText.append($("h2", "", "Unique Network BD Chatbot"), $("p", "", "Local Knowledge Assistant · Brain & Backend Profile"));
  hero.append(brand, $("span", "profile-live", "SOURCE + LIVE CHECKS"));
  brand.append(brandText);
  root.append(hero);

  const overview = panel("Brain & Knowledge Overview", "Loaded frontend knowledge modules থেকে গণনা করা পরিসংখ্যান।");
  const grid = $("div", "profile-grid");
  grid.append(
    statCard("Knowledge Documents", docs.length, "Loaded source documents"),
    statCard("Categories", stats.categories.length, "Knowledge groups"),
    statCard("Indexed Terms", stats.indexedTerms, "Unique search index terms"),
    statCard("Professional ISP Cards", stats.professionalCards, "Professional ISP records")
  );
  overview.append(grid);
  root.append(overview);

  const metrics = panel("Knowledge Distribution & Completeness", "Completeness কেবল প্রয়োজনীয় field populated কি না বোঝায়।");
  const panels = $("div", "profile-panels");
  panels.append(progressPanel("Knowledge Completeness", [
    { label: "Required fields populated", value: completeness },
    { label: "Documents with response text", value: pct(docs.filter(d => Boolean(d.response?.trim())).length, docs.length) }
  ]));
  const categoryPanel = $("article", "profile-panel");
  categoryPanel.append($("h3", "", "Category Distribution"));
  [...categories.entries()].sort((a, b) => b[1] - a[1]).forEach(([category, count]) => {
    const row = $("div", "profile-category");
    row.append($("span", "", label(category)), $("span", "profile-chip", count + " documents"));
    categoryPanel.append(row);
  });
  panels.append(categoryPanel);
  metrics.append(panels);
  root.append(metrics);

  const qualityRoot = $("div");
  renderQuality(qualityRoot, docs);
  root.append(...qualityRoot.childNodes);

  const explorer = panel("Document Explorer", "Search, category filter, pagination ও source document preview।");
  renderDocuments(explorer, docs);
  root.append(explorer);

  void renderLiveMonitoring(root);

  const footer = $("p", "profile-note",
    "Loaded source totals: " + docs.length + " documents · " + totalKeywords + " keywords · " + totalWords +
    " response words · " + stats.companyDataRequired + " company data required · " + stats.generalGuidance +
    " general guidance. Profile metrics project completion percentage নয়।");
  root.append(footer);
}
