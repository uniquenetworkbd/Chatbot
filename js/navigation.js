import { initializeToolsPage } from "./tools-page.js";
import { initializeAuthControls } from "./auth-session.js";
import { initializeProfilePage } from "./profile.js";

const NAV_ITEMS = [
  {id:"chat",label:"চ্যাট",icon:"◈",href:"./index.html",page:"chat"},
  {id:"new-chat",label:"নতুন চ্যাট",icon:"+",href:"./index.html?new=1",page:"new-chat"},
  {id:"profile",label:"Chatbot Profile",icon:"◉",href:"./profile.html",page:"profile"},
  {id:"history",label:"চ্যাট ইতিহাস",icon:"◷",href:"./layout.html?page=history",page:"history"},
  {id:"archived",label:"Archived",icon:"▤",href:"./layout.html?page=archived",page:"archived"},
  {id:"tools",label:"Network Tools",icon:"⌘",href:"./layout.html?page=tools",page:"tools"},
  {id:"settings",label:"Settings",icon:"⚙",href:"./layout.html?page=settings",page:"settings"},
  {id:"admin-profile",label:"Admin Profile",icon:"♙",href:"./admin-profile.html",page:"admin-profile"}
];
const HISTORY_KEY="unbd-chat-history-v1";
const ARCHIVE_KEY="unbd-chat-archived-v1";
function currentPage(){
  const path=window.location.pathname;
  if(path.endsWith("/index.html")||path.endsWith("/Chatbot/")||path==="/")return "chat";
  if(path.endsWith("/profile.html"))return "profile";
  if(path.endsWith("/admin-profile.html"))return "admin-profile";
  return new URLSearchParams(window.location.search).get("page")||"settings";
}
function create(tag,className,text){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
}
function readArray(key){
  try{const value=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(value)?value:[];}catch{return [];}
}
function writeArray(key,value){
  try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}
}
function renderNavigation(){
  const root=document.getElementById("navigation-root");if(!root)return null;
  if(root.dataset.initialized==="true")return {aside:root.querySelector(".sidebar"),backdrop:root.querySelector(".nav-backdrop"),close:root.querySelector(".sidebar-close")};
  const page=currentPage(),aside=create("aside","sidebar is-closed");aside.id="app-sidebar";aside.setAttribute("aria-label","প্রধান নেভিগেশন");
  const brand=create("div","sidebar-brand"),mark=create("span","brand-mark","U"),brandText=create("span","","Unique Network BD"),close=create("button","sidebar-close","×");
  close.type="button";close.setAttribute("aria-label","মেনু বন্ধ করুন");brand.append(mark,brandText,close);aside.append(brand);
  const caption=create("p","nav-caption","MENU"),nav=create("nav","nav-links");nav.setAttribute("aria-label","প্রধান মেনু");
  for(const item of NAV_ITEMS){
    const link=create("a","nav-link");link.href=item.href;link.dataset.page=item.page;
    if(item.page===page||(item.page==="new-chat"&&page==="chat"&&new URLSearchParams(location.search).get("new")==="1"))link.setAttribute("aria-current","page");
    const icon=create("span","nav-icon",item.icon),label=create("span","nav-label",item.label);icon.setAttribute("aria-hidden","true");link.append(icon,label);nav.append(link);
  }
  aside.append(caption,nav);
  const foot=create("div","sidebar-footer","Unique Network BD · Support Assistant");aside.append(foot);
  const backdrop=create("div","nav-backdrop");backdrop.id="nav-backdrop";backdrop.setAttribute("aria-hidden","true");
  root.replaceChildren(backdrop,aside);root.dataset.initialized="true";return {aside,backdrop,close};
}
function initializeNavigation(){
  const root=document.getElementById("navigation-root");if(root?.dataset.initialized==="true")return;
  const elements=renderNavigation();if(!elements)return;
  const {aside,backdrop,close}=elements,toggle=document.getElementById("menu-toggle");
  initializeAuthControls();
  const setOpen=open=>{aside.classList.toggle("is-open",open);aside.classList.toggle("is-closed",!open);backdrop.classList.toggle("is-visible",open);document.body.classList.toggle("nav-open",open);toggle?.setAttribute("aria-expanded",String(open));};
  toggle?.addEventListener("click",event=>{event.stopPropagation();setOpen(!aside.classList.contains("is-open"));});
  close.addEventListener("click",()=>setOpen(false));backdrop.addEventListener("click",()=>setOpen(false));
  document.addEventListener("click",event=>{if(!aside.classList.contains("is-open"))return;const target=event.target;if(!(target instanceof Node))return;if(!aside.contains(target)&&!toggle?.contains(target))setOpen(false);});
  document.addEventListener("keydown",event=>{if(event.key==="Escape")setOpen(false);});
  aside.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>setOpen(false)));
  document.getElementById("theme-toggle")?.addEventListener("click",toggleTheme);
  try{const saved=localStorage.getItem("unbd-theme");if(saved==="light"||saved==="dark")document.documentElement.dataset.theme=saved;}catch{}
  renderExtensionPage();
}
function toggleTheme(){
  const next=document.documentElement.dataset.theme==="light"?"dark":"light";document.documentElement.dataset.theme=next;
  try{localStorage.setItem("unbd-theme",next);}catch{}
}
function renderHistoryPage(content,title){
  title.textContent="চ্যাট ইতিহাস";
  const intro=create("p","page-description","এই ব্রাউজারে সংরক্ষিত আপনার কথোপকথন।");
  const toolbar=create("div","history-toolbar"),search=create("input","history-page-search");
  search.type="search";search.placeholder="ইতিহাসে বার্তা খুঁজুন...";search.setAttribute("aria-label","চ্যাট ইতিহাসে খুঁজুন");
  const archive=create("button","history-primary-action","বর্তমান চ্যাট আর্কাইভ করুন");archive.type="button";
  toolbar.append(search,archive);content.append(intro,toolbar);
  const list=create("div","history-list");list.id="history-page-list";content.append(list);
  const render=()=>{
    const history=readArray(HISTORY_KEY),query=search.value.trim().toLocaleLowerCase("bn");
    list.replaceChildren();
    const filtered=history.filter(item=>!query||item.text.toLocaleLowerCase("bn").includes(query));
    if(!filtered.length){list.append(create("p","empty-state",query?"এই শব্দের সঙ্গে মেলে এমন কোনো বার্তা পাওয়া যায়নি।":"এখনো কোনো সংরক্ষিত কথোপকথন নেই।"));return;}
    filtered.forEach((item,index)=>{
      const card=create("article","extension-card history-entry"),label=create("strong","",item.role==="user"?"আপনি":"Unique Network BD সহায়তা"),message=create("p","",item.text);
      const stamp=create("small","history-timestamp",item.timestamp?new Date(item.timestamp).toLocaleString("bn-BD"):"");card.append(label,message,stamp);list.append(card);
    });
  };
  search.addEventListener("input",render);
  archive.addEventListener("click",()=>{
    const messages=readArray(HISTORY_KEY);if(!messages.length){archive.textContent="আর্কাইভ করার মতো চ্যাট নেই";archive.disabled=true;return;}
    const archived=readArray(ARCHIVE_KEY);archived.unshift({id:globalThis.crypto?.randomUUID?.()||"archive-"+Date.now(),archivedAt:new Date().toISOString(),messages});
    if(!writeArray(ARCHIVE_KEY,archived)||!writeArray(HISTORY_KEY,[])){archive.textContent="সংরক্ষণ করা যায়নি";return;}
    archive.textContent="চ্যাট আর্কাইভ হয়েছে";render();
  });
  render();
}
function renderArchivedPage(content,title){
  title.textContent="Archived";
  content.append(create("p","page-description","আপনার আর্কাইভ করা কথোপকথনগুলো এখানে থাকবে।"));
  const list=create("div","history-list");content.append(list);
  const archived=readArray(ARCHIVE_KEY);
  if(!archived.length){list.append(create("p","empty-state","এখনো কোনো Archived Chat নেই।"));return;}
  archived.forEach(item=>{
    const card=create("article","extension-card archived-entry");
    const first=item.messages?.find(message=>message.role==="user")?.text||"কথোপকথন";
    const heading=create("strong","",first.slice(0,100)),meta=create("small","history-timestamp",(item.archivedAt?new Date(item.archivedAt):new Date()).toLocaleString("bn-BD"));
    const preview=create("p","",item.messages?.length+"টি বার্তা");
    const actions=create("div","archived-actions"),restore=create("button","history-primary-action","Restore"),remove=create("button","history-secondary-action","Delete");
    restore.type=remove.type="button";
    restore.addEventListener("click",()=>{
      const current=readArray(HISTORY_KEY);
      if(current.length){const next=readArray(ARCHIVE_KEY);next.unshift({id:"archive-"+Date.now(),archivedAt:new Date().toISOString(),messages:current});writeArray(ARCHIVE_KEY,next);}
      writeArray(HISTORY_KEY,item.messages||[]);writeArray(ARCHIVE_KEY,readArray(ARCHIVE_KEY).filter(entry=>entry.id!==item.id));location.href="./layout.html?page=history";
    });
    remove.addEventListener("click",()=>{writeArray(ARCHIVE_KEY,readArray(ARCHIVE_KEY).filter(entry=>entry.id!==item.id));card.remove();if(!list.children.length)list.append(create("p","empty-state","এখনো কোনো Archived Chat নেই।"));});
    actions.append(restore,remove);card.append(heading,meta,preview,actions);list.append(card);
  });
}
function renderExtensionPage(){
  if(document.body.dataset.page!=="extension")return;
  const page=currentPage(),title=document.getElementById("page-title"),content=document.getElementById("page-content");if(!content)return;
  content.replaceChildren();
  if(page==="tools"){title.textContent="Network Tools";initializeToolsPage(content);return;}
  if(page==="profile"){title.textContent="Chatbot Profile";initializeProfilePage(content);return;}
  if(page==="history"){renderHistoryPage(content,title);return;}
  if(page==="archived"){renderArchivedPage(content,title);return;}
  title.textContent="Settings";content.append(create("p","page-description","এই ব্রাউজারের জন্য ইন্টারফেস থিম নির্বাচন করুন।"));
  const button=create("button","history-primary-action");button.type="button";
  const update=()=>button.textContent=document.documentElement.dataset.theme==="light"?"Dark theme ব্যবহার করুন":"Light theme ব্যবহার করুন";update();button.addEventListener("click",()=>{toggleTheme();update();});content.append(button);
}
export {initializeNavigation,renderNavigation};
