const NAV_ITEMS = [
  { id: "chat", label: "চ্যাট", icon: "◈", href: "./index.html", page: "chat" },
  { id: "history", label: "History", icon: "◷", href: "./layout.html?page=history", page: "history" },
  { id: "tools", label: "Tools", icon: "⌘", href: "./layout.html?page=tools", page: "tools" },
  { id: "settings", label: "Settings", icon: "⚙", href: "./layout.html?page=settings", page: "settings" }
];

function currentPage() {
  const path = window.location.pathname;
  if (path.endsWith("/index.html") || path.endsWith("/Chatbot/") || path === "/") return "chat";
  return new URLSearchParams(window.location.search).get("page") || "settings";
}

function renderNavigation() {
  const root = document.getElementById("navigation-root");
  if (!root) return null;
  const page = currentPage();
  const aside = document.createElement("aside");
  aside.className = "sidebar is-closed";
  aside.id = "app-sidebar";
  aside.setAttribute("aria-label", "প্রধান নেভিগেশন");
  const brand = document.createElement("div");
  brand.className = "sidebar-brand";
  brand.innerHTML = '<span class="brand-mark" aria-hidden="true">U</span><span>Unique Network BD</span>';
  const close = document.createElement("button");
  close.className = "sidebar-close";
  close.type = "button";
  close.setAttribute("aria-label", "মেনু বন্ধ করুন");
  close.textContent = "×";
  brand.append(close);
  aside.append(brand);
  const caption = document.createElement("p");
  caption.className = "nav-caption";
  caption.textContent = "WORKSPACE";
  aside.append(caption);
  const nav = document.createElement("nav");
  nav.className = "nav-links";
  nav.setAttribute("aria-label", "Workspace pages");
  for (const item of NAV_ITEMS) {
    const link = document.createElement("a");
    link.className = "nav-link";
    link.href = item.href;
    link.dataset.page = item.page;
    if (item.page === page) link.setAttribute("aria-current", "page");
    const icon = document.createElement("span");
    icon.className = "nav-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = item.icon;
    const label = document.createElement("span");
    label.textContent = item.label;
    link.append(icon, label);
    nav.append(link);
  }
  aside.append(nav);
  const foot = document.createElement("div");
  foot.className = "sidebar-footer";
  foot.textContent = "Unique Network BD · Local knowledge assistant";
  aside.append(foot);
  const backdrop = document.createElement("div");
  backdrop.className = "nav-backdrop";
  backdrop.id = "nav-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  root.replaceChildren(backdrop, aside);
  return { aside, backdrop, close };
}

function initializeNavigation() {
  const elements = renderNavigation();
  if (!elements) return;
  const { aside, backdrop, close } = elements;
  const toggle = document.getElementById("menu-toggle");
  const setOpen = (open) => {
    aside.classList.toggle("is-open", open);
    aside.classList.toggle("is-closed", !open);
    backdrop.classList.toggle("is-visible", open);
    document.body.classList.toggle("nav-open", open);
    toggle?.setAttribute("aria-expanded", String(open));
  };
  toggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!aside.classList.contains("is-open"));
  });
  close.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));
  document.addEventListener("click", (event) => {
    if (!aside.classList.contains("is-open")) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!aside.contains(target) && !toggle?.contains(target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
  aside.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("unbd-theme", next); } catch { /* Storage can be unavailable. */ }
  });
  try {
    const savedTheme = localStorage.getItem("unbd-theme");
    if (savedTheme === "light" || savedTheme === "dark") document.documentElement.dataset.theme = savedTheme;
  } catch { /* Default theme remains active. */ }
  renderExtensionPage();
}

function renderExtensionPage() {
  if (document.body.dataset.page !== "extension") return;
  const page = currentPage();
  const title = document.getElementById("page-title");
  const content = document.getElementById("page-content");
  const pages = {
    settings: ["Settings", "এই পৃষ্ঠায় বর্তমানে কোনো অ্যাকাউন্ট বা সার্ভার সেটিংস সংযুক্ত নেই। থিম পরিবর্তন উপরের বোতাম থেকে করা যায়।"],
    history: ["History", "এই ব্রাউজারের স্থানীয় চ্যাট হিস্ট্রি এখানে ভবিষ্যতে দেখানো যাবে। বর্তমান সংস্করণে সার্ভার-সিঙ্ক বা বহু-ডিভাইস হিস্ট্রি নেই।"],
    tools: ["Tools", "এই সংস্করণে কোনো বাহ্যিক টুল, API বা তৃতীয় পক্ষের সংযোগ সক্রিয় নেই।"]
  };
  const selected = pages[page] || pages.settings;
  if (title) title.textContent = selected[0];
  if (content) {
    const heading = document.createElement("h2");
    heading.textContent = selected[0];
    const paragraph = document.createElement("p");
    paragraph.textContent = selected[1];
    content.replaceChildren(heading, paragraph);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeNavigation, { once: true });
else initializeNavigation();

export { initializeNavigation, renderNavigation };