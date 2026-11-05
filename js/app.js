import { searchKnowledge, FALLBACK_RESPONSE, getKnowledgeStats } from "./knowledge/index.js";
import { initializeNavigation } from "./navigation.js";

const STORAGE_KEY = "unbd-chat-history-v1";
const MAX_HISTORY = 60;

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.text === "string").slice(-MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_HISTORY))); }
  catch { showStorageNotice(); }
}

function showStorageNotice() {
  const notice = document.getElementById("storage-notice");
  if (notice) return;
  const element = document.createElement("p");
  element.id = "storage-notice";
  element.className = "disclaimer";
  element.textContent = "এই ব্রাউজারে স্থানীয় ইতিহাস সংরক্ষণ করা যাচ্ছে না।";
  document.querySelector(".composer-wrap")?.append(element);
}

function appendMessage(list, role, text) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  article.dataset.role = role;
  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = role === "user" ? "আপনি" : "Unique Network BD সহায়তা";
  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = text;
  article.append(meta, body);
  list.append(article);
  return article;
}

function initializeChat() {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("message-input");
  const list = document.getElementById("message-list");
  const welcome = document.getElementById("welcome-panel");
  if (!form || !input || !list) return;
  let history = readHistory();
  history.forEach((item) => appendMessage(list, item.role, item.text));
  if (history.length) welcome?.classList.add("is-hidden");

  const sendMessage = (rawText) => {
    const text = rawText.trim();
    if (!text) return;
    welcome?.classList.add("is-hidden");
    history.push({ role: "user", text, timestamp: Date.now() });
    appendMessage(list, "user", text);
    const result = searchKnowledge(text);
    const response = result.matched ? result.response : FALLBACK_RESPONSE;
    history.push({ role: "assistant", text: response, timestamp: Date.now(), category: result.category });
    appendMessage(list, "assistant", response);
    history = history.slice(-MAX_HISTORY);
    saveHistory(history);
    list.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(input.value);
    input.value = "";
    input.focus();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  document.querySelectorAll("[data-prompt]").forEach((button) => button.addEventListener("click", () => {
    const prompt = button.getAttribute("data-prompt");
    if (prompt) sendMessage(prompt);
  }));
  document.title = "Unique Network BD | Support Assistant";
  console.info("Knowledge base ready", getKnowledgeStats());
}

function start() {
  initializeNavigation();
  initializeChat();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();

export { initializeChat, sendFallback: () => FALLBACK_RESPONSE };