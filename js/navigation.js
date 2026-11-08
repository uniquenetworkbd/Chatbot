import { getKnowledgeStats } from "./knowledge/index.js";
import { initializeToolsPage } from "./tools-page.js";
import { initializeAuthControls } from "./auth-session.js";

const NAV_ITEMS = [
  {id:"chat",label:"চ্যাট",icon:"◈",href:"./index.html",page:"chat"},
  {id:"history",label:"History",icon:"◷",href:"./layout.html?page=history",page:"history"},
  {id:"tools",label:"Network Tools",icon:"⌘",href:"./layout.html?page=tools",page:"tools"},
  {id:"settings",label:"Settings",icon:"⚙",href:"./layout.html?page=settings",page:"settings"}
];
function currentPage(){
  const path=window.location.pathname;
  if(path.endsWith("/index.html")||path.endsWith("/Chatbot/")||path==="/")return "chat";
  return new URLSearchParams(window.location.search).get("page")||"settings";
}
function renderNavigation(){
  const root=document.getElementById("navigation-root");if(!root)return null;
  if(root.dataset.initialized==="true")return {aside:root.querySelector(".sidebar"),backdrop:root.querySelector(".nav-backdrop"),close:root.querySelector(".sidebar-close")};
  const page=currentPage(),aside=document.createElement("aside");aside.className="sidebar is-closed";aside.id="app-sidebar";aside.setAttribute("aria-label","প্রধান নেভিগেশন");
  const brand=document.createElement("div");brand.className="sidebar-brand";
  const mark=document.createElement("span");mark.className="brand-mark";mark.textContent="U";
  const brandText=document.createElement("span");brandText.textContent="Unique Network BD";
  const close=document.createElement("button");close.className="sidebar-close";close.type="button";close.setAttribute("aria-label","মেনু বন্ধ করুন");close.textContent="×";brand.append(mark,brandText,close);aside.append(brand);
  const caption=document.createElement("p");caption.className="nav-caption";caption.textContent="WORKSPACE";aside.append(caption);
  const nav=document.createElement("nav");nav.className="nav-links";nav.setAttribute("aria-label","Workspace pages");
  for(const item of NAV_ITEMS){const link=document.createElement("a");link.className="nav-link";link.href=item.href;link.dataset.page=item.page;if(item.page===page)link.setAttribute("aria-current","page");const icon=document.createElement("span");icon.className="nav-icon";icon.textContent=item.icon;icon.setAttribute("aria-hidden","true");const label=document.createElement("span");label.textContent=item.label;link.append(icon,label);nav.append(link);}
  aside.append(nav);const foot=document.createElement("div");foot.className="sidebar-footer";foot.textContent="Unique Network BD · Local knowledge assistant";aside.append(foot);
  const backdrop=document.createElement("div");backdrop.className="nav-backdrop";backdrop.id="nav-backdrop";backdrop.setAttribute("aria-hidden","true");root.replaceChildren(backdrop,aside);root.dataset.initialized="true";return {aside,backdrop,close};
}
function initializeNavigation(){
  const root=document.getElementById("navigation-root");if(root?.dataset.initialized==="true")return;
  const elements=renderNavigation();if(!elements)return;const {aside,backdrop,close}=elements,toggle=document.getElementById("menu-toggle");
  initializeAuthControls();
  const setOpen=open=>{aside.classList.toggle("is-open",open);aside.classList.toggle("is-closed",!open);backdrop.classList.toggle("is-visible",open);document.body.classList.toggle("nav-open",open);toggle?.setAttribute("aria-expanded",String(open));};
  toggle?.addEventListener("click",event=>{event.stopPropagation();setOpen(!aside.classList.contains("is-open"));});
  close.addEventListener("click",()=>setOpen(false));backdrop.addEventListener("click",()=>setOpen(false));
  document.addEventListener("click",event=>{if(!aside.classList.contains("is-open"))return;const target=event.target;if(!(target instanceof Node))return;if(!aside.contains(target)&&!toggle?.contains(target))setOpen(false);});
  document.addEventListener("keydown",event=>{if(event.key==="Escape")setOpen(false);});
  aside.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>setOpen(false)));
  document.getElementById("theme-toggle")?.addEventListener("click",()=>{const next=document.documentElement.dataset.theme==="light"?"dark":"light";document.documentElement.dataset.theme=next;try{localStorage.setItem("unbd-theme",next);}catch{}});
  try{const saved=localStorage.getItem("unbd-theme");if(saved==="light"||saved==="dark")document.documentElement.dataset.theme=saved;}catch{}
  renderExtensionPage();
}
function renderExtensionPage(){
  if(document.body.dataset.page!=="extension")return;
  const page=currentPage(),title=document.getElementById("page-title"),content=document.getElementById("page-content");if(!content)return;
  content.replaceChildren();
  if(page==="tools"){title.textContent="Network Tools";initializeToolsPage(content);return;}
  const heading=document.createElement("h2"),paragraph=document.createElement("p");content.append(heading,paragraph);
  if(page==="history"){
    heading.textContent="History";paragraph.textContent="এই ব্রাউজারে সংরক্ষিত সাম্প্রতিক কথোপকথন।";let history=[];
    try{const saved=JSON.parse(localStorage.getItem("unbd-chat-history-v1")||"[]");if(Array.isArray(saved))history=saved.filter(item=>item&&["user","assistant"].includes(item.role)&&typeof item.text==="string");}catch{paragraph.textContent="ব্রাউজারের স্থানীয় ইতিহাস পড়া যায়নি।";}
    if(!history.length){const empty=document.createElement("p");empty.className="empty-state";empty.textContent="এখনো কোনো সংরক্ষিত কথোপকথন নেই।";content.append(empty);}
    else{const list=document.createElement("div");list.className="history-list";history.slice(-60).forEach(item=>{const entry=document.createElement("article");entry.className="extension-card";const label=document.createElement("strong");label.textContent=item.role==="user"?"আপনি":"Unique Network BD সহায়তা";const message=document.createElement("p");message.textContent=item.text;entry.append(label,message);list.append(entry);});content.append(list);}
  }else{
    heading.textContent="Settings";paragraph.textContent="এই ব্রাউজারের জন্য ইন্টারফেস থিম নির্বাচন করুন। সেটিংটি localStorage-এ সংরক্ষিত হয়.";
    const button=document.createElement("button");button.type="button";button.className="icon-button";
    const update=()=>button.textContent=document.documentElement.dataset.theme==="light"?"Dark theme ব্যবহার করুন":"Light theme ব্যবহার করুন";update();
    button.addEventListener("click",()=>{const next=document.documentElement.dataset.theme==="light"?"dark":"light";document.documentElement.dataset.theme=next;try{localStorage.setItem("unbd-theme",next);}catch{}update();});content.append(button);
  }
}
export {initializeNavigation,renderNavigation};
