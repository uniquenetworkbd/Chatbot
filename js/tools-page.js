import { mountWizard } from "./wizard.js";
import { getKnowledgeStats } from "./knowledge/index.js";
import { getApiBaseUrl } from "./config.js";
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
export function initializeToolsPage(root){
 if(!root||root.dataset.toolsReady==="true")return;root.dataset.toolsReady="true";
 const intro=el("p","Live device checks are paused while the admin workspace is deferred. The local troubleshooting guide and clearly labelled demo data remain available.","page-intro");
 const panel=el("section",undefined,"tool-panel"),head=el("div",undefined,"panel-heading");head.append(el("h3","Network status"),el("span","SIMULATION","status-pill"));
 const toolbar=el("div",undefined,"admin-toolbar"),notice=el("p","","tool-notice"),list=el("div",undefined,"network-device-grid"),refresh=el("button","Show demo status","tool-button");refresh.type="button";toolbar.append(refresh);panel.append(head,toolbar,notice,list);
 const wizard=el("section",undefined,"tool-panel"),wizardTitle=el("h3","Guided troubleshooting"),wizardRoot=el("div",undefined,"wizard-root");wizard.append(wizardTitle,wizardRoot);
 const stats=getKnowledgeStats(),knowledge=el("section",undefined,"tool-panel");knowledge.append(el("h3","Local knowledge index"),el("p",stats.documents+" documents · "+stats.indexedTerms+" indexed terms · "+stats.categories.join(" / ")));
 const configLink=el("a","Router & OLT Connection Test · Admin login required","tool-button");configLink.href="./layout.html?page=network-config";
 root.replaceChildren(el("h2","ISP Network Tools"),intro,configLink,panel,wizard,knowledge);mountWizard(wizardRoot);
 function renderDemo(){head.lastChild.textContent="SIMULATION";notice.textContent="লোকাল ডেমো ডেটা—কোনো Router/OLT-তে সংযোগ করা হয়নি এবং এটি বাস্তব নেটওয়ার্ক মাপ নয়।";list.replaceChildren();for(const device of [{label:"MikroTik Core Router (Demo)",status:"simulated",latencyMs:4.8,check:"simulated"},{label:"BDCOM OLT (Demo)",status:"simulated",latencyMs:8.2,check:"simulated"}]){const card=el("article",undefined,"device-card");card.append(el("strong",device.label),el("span",device.status,"status-pill"),el("p",device.check+" · "+device.latencyMs+" ms"));list.append(card);}list.append(el("p","Demo bandwidth: ↓ 72.4 Mbps · ↑ 18.6 Mbps · 38% utilization (simulated)","metric-line"));}
 async function load(){refresh.disabled=true;head.lastChild.textContent="Checking…";list.replaceChildren();try{const base=await getApiBaseUrl();if(!base){renderDemo();return;}renderDemo();notice.textContent="Live device checks remain disabled until admin workspace is re-enabled. Displayed device values are simulated.";}catch{renderDemo();}finally{refresh.disabled=false;}}
 refresh.addEventListener("click",()=>void load());void load();
}
