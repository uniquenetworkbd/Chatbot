import { DOCUMENTS, getKnowledgeStats } from "./knowledge/index.js";
import { getApiBaseUrl } from "./config.js";

const $ = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};
const safe = value => typeof value === "string" ? value : String(value ?? "");
const countWords = value => safe(value).trim().split(/\s+/u).filter(Boolean).length;
const categoryLabel = value => ({company:"Company",internet:"Internet",billing:"Billing",security:"Security"}[value] || value || "Uncategorized");
function statCard(label,value,note){const card=$("article","profile-stat");card.append($("span","",label),$("strong","",value),$("small","",note));return card;}
function progressPanel(title,rows){
  const panel=$("article","profile-panel");panel.append($("h3","",title));
  rows.forEach(row=>{const line=$("div","profile-progress-row");line.append($("span","",row.label),$("strong","",row.value+"%"));const track=$("div","profile-progress"),fill=$("span");fill.style.width=row.value+"%";track.append(fill);panel.append(line,track);});
  return panel;
}
function createPreview(document){
  const dialog=$("dialog","profile-doc-preview");dialog.setAttribute("aria-label", "Document preview");
  const head=$("div","profile-preview-head"),title=$("h2","",document.id||"Knowledge document"),close=$("button","profile-button","বন্ধ করুন");close.type="button";close.addEventListener("click",()=>dialog.close());head.append(title,close);
  const meta=$("p","profile-note",categoryLabel(document.category)+" · "+(document.keywords?.length||0)+" keywords · "+countWords(document.response)+" response words");
  const body=$("div","profile-preview-body",document.response||"এই ডকুমেন্টে response content নেই।");
  const keywordTitle=$("h3","","Keywords");keywordTitle.style.fontSize=".8rem";
  const keywords=$("div","profile-preview-keywords");(document.keywords||[]).forEach(word=>keywords.append($("span","profile-chip",word)));
  dialog.append(head,meta,body,keywordTitle,keywords);
  dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
  return dialog;
}
function renderDocuments(root,docs){
  const tools=$("div","profile-doc-tools"),search=$("input","profile-search"),filter=$("select","profile-filter");
  search.type="search";search.placeholder="ডকুমেন্টের নাম, ID বা keyword খুঁজুন";search.setAttribute("aria-label","Search documents");
  [["all","সব ক্যাটাগরি"],...([...new Set(docs.map(d=>d.category))].map(c=>[c,categoryLabel(c)]))].forEach(([value,label])=>{const option=$("option","",label);option.value=value;filter.append(option);});
  tools.append(search,filter);const list=$("div","profile-doc-list");
  const render=()=>{list.replaceChildren();const query=search.value.trim().toLocaleLowerCase();const selected=filter.value;const filtered=docs.filter(doc=>(selected==="all"||doc.category===selected)&&[doc.id,doc.category,...(doc.keywords||[])].join(" ").toLocaleLowerCase().includes(query));
    if(!filtered.length){list.append($("div","profile-empty","কোনো matching document পাওয়া যায়নি।"));return;}
    filtered.forEach(doc=>{const item=$("article","profile-doc"),details=$("div"),heading=$("h3","",doc.id||"Unnamed document"),desc=$("p","",safe(doc.response).slice(0,150)+(safe(doc.response).length>150?"…":""));const meta=$("div","profile-doc-meta");meta.append($("span","profile-chip",categoryLabel(doc.category)),$("span","profile-chip",(doc.keywords||[]).length+" keywords"),$("span","profile-chip",countWords(doc.response)+" response words"));details.append(heading,desc,meta);const button=$("button","profile-button","Preview ↗");button.type="button";button.addEventListener("click",()=>{const dialog=createPreview(doc);document.body.append(dialog);dialog.addEventListener("close",()=>dialog.remove(),{once:true});dialog.showModal();});item.append(details,button);list.append(item);});
  };
  search.addEventListener("input",render);filter.addEventListener("change",render);render();root.append(tools,list);
}
async function renderBackend(root){
  const status=$("span","profile-status","Backend status যাচাই হচ্ছে…");status.dataset.state="checking";root.append(status);
  const cards=$("div","profile-backend-list");
  const items=[
    ["Runtime","Express 5 / Node.js","backend/server.js"],
    ["Database","SQLite + better-sqlite3","backend/database/connection.js"],
    ["Migrations","Startup migration runner","backend/database/migrations.js"],
    ["Health API","GET /api/health","Public health endpoint"],
    ["Chat Logs API","GET/POST /api/chat-logs","API route is configured"],
    ["Interactions API","GET/POST /api/interactions","API route is configured"],
    ["Authentication","Admin auth routes protected","backend/routes/auth.js"],
    ["Network API","/api/network","Network route mounted"],
    ["Admin Analytics","/api/admin/analytics","Admin-only route mounted"]
  ];
  items.forEach(([name,detail,source])=>{const card=$("div","profile-backend-item");card.append($("strong","",name),$("span","",detail),$("span","",source));cards.append(card);});
  root.append(cards);
  const note=$("p","profile-note","এই তালিকা repository source থেকে চিহ্নিত route ও component দেখায়; প্রতিটি endpoint-এর কার্যকারিতা এখানে আলাদাভাবে test করা হয়নি।");
  root.append(note);
  try{
    const base=await getApiBaseUrl();
    if(!base){status.textContent="Backend unavailable / health check not confirmed";status.dataset.state="offline";return;}
    const response=await fetch(base+"/api/health",{cache:"no-store",credentials:"omit"});
    const data=await response.json();
    if(!response.ok||data.status!=="ok"||data.database!=="ok")throw new Error("Health check returned a non-healthy response");
    status.textContent="Backend online · Database "+data.database+" · Schema v"+(data.schemaVersion??"unknown");status.dataset.state="online";
    const health=$("div","profile-backend-item");health.append($("strong","","Live health response"),$("span","", "DB file "+(data.storage?.fileBytes??"unknown")+" bytes · check "+(Number(data.checkDurationMs||0).toFixed(2))+" ms"),$("span","", "Checked "+new Date(data.timestamp||Date.now()).toLocaleString()));cards.prepend(health);
  }catch{status.textContent="Backend unavailable / health check not confirmed";status.dataset.state="offline";}
}
export function initializeProfilePage(root){
  const stats=getKnowledgeStats(),docs=DOCUMENTS;
  const complete=docs.filter(doc=>Boolean(doc.id&&doc.category&&Array.isArray(doc.keywords)&&doc.keywords.length&&typeof doc.response==="string"&&doc.response.trim())).length;
  const completeness=docs.length?Math.round(complete/docs.length*100):0;
  const categories=new Map();docs.forEach(doc=>categories.set(doc.category,(categories.get(doc.category)||0)+1));
  const totalKeywords=docs.reduce((sum,doc)=>sum+(doc.keywords?.length||0),0);
  const totalWords=docs.reduce((sum,doc)=>sum+countWords(doc.response),0);
  const hero=$("section","profile-hero"),brand=$("div","profile-brand");brand.append($("div","profile-avatar","U"));const brandText=$("div");brandText.append($("h2","","Unique Network BD Chatbot"),$("p","","Local Knowledge Assistant · Brain & Backend Profile"));hero.append(brand);hero.append($("span","profile-live","SOURCE-BASED OVERVIEW"));root.append(hero);
  const overview=$("section","profile-section"),head=$("div","profile-section-head");head.append($("div"));head.firstChild.append($("h2","","Brain & Knowledge Overview"),$("p","","বর্তমান frontend knowledge modules থেকে গণনা করা পরিসংখ্যান"));overview.append(head);
  const grid=$("div","profile-grid");grid.append(statCard("Knowledge Documents",docs.length,"Loaded source documents"),statCard("Categories",stats.categories.length,"Knowledge groups"),statCard("Indexed Terms",stats.indexedTerms,"Unique search index terms"),statCard("Professional ISP Cards",stats.professionalCards,"Professional ISP knowledge records"));overview.append(grid);root.append(overview);
  const metrics=$("section","profile-section"),panels=$("div","profile-panels");
  panels.append(progressPanel("Knowledge Completeness",[{label:"Required fields populated",value:completeness},{label:"Documents with response text",value:docs.length?Math.round(docs.filter(d=>Boolean(d.response?.trim())).length/docs.length*100):0}]));
  const categoryPanel=$("article","profile-panel");categoryPanel.append($("h3","","Category Distribution"));[...categories.entries()].sort((a,b)=>b[1]-a[1]).forEach(([category,count])=>{const row=$("div","profile-category");row.append($("span","",categoryLabel(category)),$("span","profile-chip",count+" documents"));categoryPanel.append(row);});panels.append(categoryPanel);metrics.append(panels);root.append(metrics);
  const details=$("section","profile-section"),detailHead=$("div","profile-section-head");detailHead.append($("div"));detailHead.firstChild.append($("h2","","Document Explorer"),$("p","","প্রতিটি source document-এর response ও keyword preview দেখুন"));details.append(detailHead);renderDocuments(details,docs);root.append(details);
  const backend=$("section","profile-section"),backendHead=$("div","profile-section-head");backendHead.append($("div"));backendHead.firstChild.append($("h2","","Backend & API Architecture"),$("p","","Source configuration এবং উপলভ্য হলে live health response"));backend.append(backendHead);root.append(backend);void renderBackend(backend);
  const footer=$("p","profile-note","Document totals, keyword totals ও word counts loaded frontend source থেকে গণনা করা। মোট keyword: "+totalKeywords+" · Response words: "+totalWords+" · Company data required: "+stats.companyDataRequired+" · General guidance: "+stats.generalGuidance+". Completeness percentage শুধু document-এর প্রয়োজনীয় field পূরণ আছে কি না তা বোঝায়; এটি পুরো chatbot project completion percentage নয়।");
  root.append(footer);
}
