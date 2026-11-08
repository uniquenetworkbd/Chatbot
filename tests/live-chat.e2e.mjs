import { chromium } from "playwright";

const site = process.env.SITE_URL || "https://uniquenetworkbd.github.io/Chatbot";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const response = await page.goto(site + "/", { waitUntil: "networkidle", timeout: 60000 });
  if (!response?.ok()) throw new Error("Live HTTPS homepage returned " + response?.status());
  await page.locator("#chat-form").waitFor();
  await page.evaluate(() => {
    const list = document.querySelector("#message-list");
    document.querySelector("#welcome-panel")?.classList.add("is-hidden");
    for (let i = 0; i < 24; i++) {
      const item = document.createElement("article");
      item.className = "message assistant";
      item.textContent = "Live layout verification message " + i + " — ".repeat(12);
      list.append(item);
    }
  });
  const chat = page.locator(".chat-shell");
  const composer = page.locator(".composer-wrap");
  const header = page.locator(".topbar");
  const scroll = page.locator("#scroll-bottom");
  const before = await page.evaluate(() => ({
    composer: document.querySelector(".composer-wrap").getBoundingClientRect().top,
    header: document.querySelector(".topbar").getBoundingClientRect().top
  }));
  await chat.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event("scroll")); });
  await scroll.waitFor({ state: "visible" });
  const layout = await page.evaluate(() => ({
    composer: document.querySelector(".composer-wrap").getBoundingClientRect().top,
    header: document.querySelector(".topbar").getBoundingClientRect().top,
    scrollBottom: document.querySelector("#scroll-bottom").getBoundingClientRect().bottom,
    pageOverflow: document.documentElement.scrollHeight > innerHeight + 1
  }));
  if (Math.abs(layout.composer - before.composer) > 1) throw new Error("Live composer is not fixed");
  if (Math.abs(layout.header - before.header) > 1) throw new Error("Live top navigation is not fixed");
  if (layout.scrollBottom >= layout.composer - 4) throw new Error("Live scroll button overlaps composer");
  if (layout.pageOverflow) throw new Error("Live page scrolls instead of conversation panel");
  await scroll.click();
  await page.waitForFunction(() => {
    const el = document.querySelector(".chat-shell");
    return el.scrollHeight - el.clientHeight - el.scrollTop < 8;
  });
  if (errors.length) throw new Error("Live browser runtime errors: " + errors.join(" | "));
  console.log("PASS: Live HTTPS mobile browser — fixed header/composer, independently scrolling conversation, non-overlapping scroll-to-bottom control, no page overflow or runtime errors.");
} finally {
  await browser.close();
}
