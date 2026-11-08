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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error("Profile page has horizontal overflow at 390px");
  if (errors.length) throw new Error("Browser runtime errors: " + errors.join(" | "));
  console.log("PASS: Profile loads, category menu filters, search works, pagination works, complete source fields and raw JSON display, preview opens/closes, mobile viewport has no horizontal overflow, no uncaught page errors.");
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
