import { chromium } from "playwright";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const target = path.resolve(root, "." + pathname);
    if (!target.startsWith(root + path.sep) && target !== root) throw new Error("Invalid path");
    const info = await stat(target);
    const file = info.isDirectory() ? path.join(target, "index.html") : target;
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
});
await new Promise(resolve => server.listen(4173, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173/profile.html", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Brain & Knowledge Overview" }).waitFor();
  await page.locator(".profile-doc").first().waitFor();
  if (await page.locator(".profile-doc").count() > 30) throw new Error("Pagination should cap first page at 30 documents");
  const categoryButtons = page.locator(".profile-category-button");
  if (await categoryButtons.count() < 2) throw new Error("Category menu buttons were not rendered");
  const categoryButton = categoryButtons.nth(1);
  const categoryLabel = await categoryButton.textContent();
  await categoryButton.click();
  if (!(await page.locator(".profile-doc").count())) throw new Error("Category menu did not filter documents");
  if (await categoryButton.getAttribute("aria-pressed") !== "true") throw new Error("Selected category is not marked active");
  await categoryButtons.first().click();
  await page.getByRole("searchbox", { name: "Search documents" }).fill("internet");
  if (!(await page.locator(".profile-doc").count())) throw new Error("Document search returned no results");
  await page.getByRole("searchbox", { name: "Search documents" }).fill("");
  await page.getByRole("button", { name: "পরের" }).click();
  if (!(await page.locator(".profile-doc").count())) throw new Error("Pagination next page is empty");
  await page.getByRole("button", { name: /Preview/ }).first().click();
  await page.locator("dialog.profile-doc-preview[open]").waitFor();
  await page.getByText("সম্পূর্ণ source record", { exact: false }).waitFor();
  await page.locator(".profile-preview-field").first().waitFor();
  const visibleFieldNames = await page.locator(".profile-preview-field h3").allTextContents();
  if (!visibleFieldNames.includes("id") || !visibleFieldNames.includes("category") || !visibleFieldNames.includes("keywords") || !visibleFieldNames.includes("response")) {
    throw new Error("Preview does not display every core source field: " + visibleFieldNames.join(", "));
  }
  await page.getByText("সম্পূর্ণ Raw JSON দেখুন").click();
  await page.locator(".profile-preview-json").waitFor();
  await page.getByRole("button", { name: "বন্ধ করুন" }).click();

  // New categories, nested objects/arrays and unknown fields must render without UI code changes.
  const dynamicResult = await page.evaluate(async () => {
    const { renderDocuments, createPreview } = await import("/js/profile.js");
    const fixture = [{ id: "future-schema-test", category: "future-category", keywords: ["nestedsearchtoken"], response: "Dynamic document response", metadata: { owner: { team: "support" }, tags: ["new", "automatic"] }, flags: [{ enabled: true, label: "auto-added" }], futureField: "visible-without-preview-code-update" }];
    const root = document.createElement("section");
    renderDocuments(root, fixture);
    document.body.append(root);
    const category = [...root.querySelectorAll(".profile-category-button")].find(button => button.textContent.includes("future-category"));
    if (!category) throw new Error("New category was not generated from document data");
    category.click();
    if (root.querySelectorAll(".profile-doc").length !== 1) throw new Error("New category did not filter fixture document");
    root.querySelector(".profile-search").value = "nestedsearchtoken";
    root.querySelector(".profile-search").dispatchEvent(new Event("input", { bubbles: true }));
    if (root.querySelectorAll(".profile-doc").length !== 1) throw new Error("Search did not index newly added document data");
    const preview = createPreview(fixture[0]);
    document.body.append(preview);
    preview.showModal();
    const visible = preview.textContent;
    const checks = ["metadata", "owner", "team", "support", "tags", "automatic", "flags", "enabled", "futureField", "visible-without-preview-code-update"];
    const missing = checks.filter(value => !visible.includes(value));
    preview.close(); preview.remove(); root.remove();
    if (missing.length) throw new Error("Dynamic preview missing nested fields: " + missing.join(", "));
    return true;
  });
  if (!dynamicResult) throw new Error("Schema-independence fixture did not complete");
  await page.locator(".profile-preview-json").waitFor();
  await page.getByRole("button", { name: "বন্ধ করুন" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error("Profile page has horizontal overflow at 390px");
  if (errors.length) throw new Error("Browser runtime errors: " + errors.join(" | "));
  console.log("PASS: Profile loads, category menu filters, search works, pagination works, complete source fields and raw JSON display, future categories and nested fields render automatically, preview opens/closes, mobile viewport has no horizontal overflow, no uncaught page errors.");
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
