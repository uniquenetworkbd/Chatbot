import { chromium } from "playwright";

const site = process.env.SITE_URL || "https://uniquenetworkbd.github.io/Chatbot";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const response = await page.goto(site + "/profile.html", { waitUntil: "networkidle", timeout: 60000 });
  if (!response?.ok()) throw new Error("Live Profile returned HTTP " + response?.status());
  await page.getByRole("heading", { name: "Brain & Knowledge Overview" }).waitFor();
  await page.locator(".profile-doc").first().waitFor();
  const main = page.locator(".app-main");
  if (await main.evaluate(el => getComputedStyle(el).overflowY) !== "auto") throw new Error("Live Profile vertical scrolling is not enabled");
  const dimensions = await main.evaluate(el => ({ client: el.clientHeight, scroll: el.scrollHeight }));
  if (dimensions.scroll <= dimensions.client) throw new Error("Live Profile content does not overflow its scroll container");
  await main.evaluate(el => { el.scrollTop = el.scrollHeight; });
  if (await main.evaluate(el => el.scrollTop <= 0)) throw new Error("Live Profile cannot scroll down");
  await main.evaluate(el => { el.scrollTop = 0; });
  if (await main.evaluate(el => el.scrollTop !== 0)) throw new Error("Live Profile cannot scroll up");
  if (await page.locator(".topbar").evaluate(el => getComputedStyle(el).position) !== "sticky") throw new Error("Live Profile topbar is not sticky");
  if (await page.locator(".profile-doc-tools").evaluate(el => getComputedStyle(el).flexDirection) !== "column") throw new Error("Live Profile controls are not sequential");
  const search = page.locator(".profile-doc-tools > .profile-search");
  const picker = page.locator(".profile-doc-tools > .profile-document-picker");
  if ((await search.boundingBox()).y >= (await picker.boundingBox()).y) throw new Error("Live Profile search/picker order is incorrect");
  const categories = page.locator("details.profile-category-menu");
  await categories.locator("summary").click();
  if (await categories.locator(".profile-category-button").count() < 2) throw new Error("Live Profile categories are missing");
  await categories.locator(".profile-category-button").first().click();
  await page.getByRole("searchbox", { name: "Search documents" }).fill("internet");
  if (!(await page.locator(".profile-doc").count())) throw new Error("Live Profile search returned no documents");
  await page.getByRole("searchbox", { name: "Search documents" }).fill("");
  await page.getByRole("button", { name: /Preview/ }).first().click();
  await page.locator("dialog.profile-doc-preview[open]").waitFor();
  await page.locator(".profile-preview-field").first().waitFor();
  await page.getByRole("button", { name: "বন্ধ করুন" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error("Live Profile has horizontal overflow at 390px");
  if (errors.length) throw new Error("Live Profile browser runtime errors: " + errors.join(" | "));
  console.log("PASS: Live HTTPS Profile — document data, category/search/preview, vertical scroll up/down, sticky header, sequential controls and mobile width.");
} finally {
  await browser.close();
}
