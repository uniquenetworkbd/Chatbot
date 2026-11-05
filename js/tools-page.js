import { mountWizard } from "./wizard.js";
import { getKnowledgeStats } from "./knowledge/index.js";
import { getApiBaseUrl } from "./config.js";
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
export function initializeToolsPage(root){
 if(!root||root.dataset.toolsReady==="true")return;root.dataset.toolsReady="true";
 const intro=el("p","Live checks require the self-hosted backend and an operator key. Demo values are always labelled as simulated.","page-intro");
 const panel=el("section",undefined,"tool-panel"),head=el("div",undefined,"panel-heading");head.append(el("h3","Network status"),el("span","SIMULATION","status-pill"));
 const toolbar=el("div",undefined,"admin-toolbar"),key=el("input");key.type="password";key.autocomplete="off";key.placeholder="ADMIN_API_KEY (this tab only)";
 const notice=el("p","","tool-notice"),list=el("div",undefined,"network-device-grid"),refresh=el("button","Check devices","tool-button");refresh.type="button";toolbar.append(key,refresh);panel.append(head,toolbar,notice,list);
 const wizard=el("section",undefined,"tool-panel"),wizardTitle=el("h3","Guided troubleshooting"),wizardRoot=el("div",undefined,"wizard-root");wizard.append(wizardTitle,wizardRoot);
 const stats=getKnowledgeStats(),knowledge=el("section",undefined,"tool-panel");knowledge.append(el("h3","Local knowledge index"),el("p",stats.documents+" documents · "+stats.indexedTerms+" indexed terms · "+stats.categories.join(" / ")));
 root.replaceChildren(el("h2","ISP Network Tools"),intro,panel,wizard,knowledge);mountWizard(wizardRoot);
 function render(data){head.lastChild.textContent=data.mode==="simulated"?"SIMULATION":"LIVE TCP";notice.textContent=data.notice||"";list.replaceChildren();
  for(const device of data.devices||[]){const card=el("article",undefined,"device-card");card.append(el("strong",device.label),el("span",device.status,"status-pill"),el("p",device.check+(device.latencyMs===null?"":" · "+device.latencyMs+" ms")));list.append(card);}
  if(data.bandwidth){const b=data.bandwidth;list.append(el("p","Demo bandwidth: ↓ "+b.downloadMbps+" Mbps · ↑ "+b.uploadMbps+" Mbps · "+b.utilizationPercent+"% utilization (simulated)","metric-line"));}
 }
 async function load(){refresh.disabled=true;head.lastChild.textContent="Checking…";list.replaceChildren();try{
  const base=getApiBaseUrl();
  if(!base){render({mode:"simulated",notice:"লোকাল ডেমো ডেটা—কোনো Router/OLT-তে সংযোগ করা হয়নি এবং এটি বাস্তব নেটওয়ার্ক মাপ নয়।",devices:[
   {label:"MikroTik Core Router (Demo)",status:"simulated",latencyMs:4.8,check:"simulated"},
   {label:"BDCOM OLT (Demo)",status:"simulated",latencyMs:8.2,check:"simulated"}
  ],bandwidth:{downloadMbps:72.4,uploadMbps:18.6,utilizationPercent:38}});return;}
  if(!key.value.trim())throw Error("Live backend check requires the admin Bearer key.");
  const response=await fetch(base+"/api/network/status",{headers:{Authorization:"Bearer "+key.value.trim()},cache:"no-store",credentials:"omit"});
  if(response.status===401)throw Error("Unauthorized: ADMIN_API_KEY ভুল।");if(!response.ok)throw Error("API HTTP "+response.status);
  render(await response.json());
 }catch(error){head.lastChild.textContent="UNAVAILABLE";notice.textContent=error.message;list.append(el("p","No live device state is claimed.","empty-state"));}finally{refresh.disabled=false;}}
 refresh.addEventListener("click",load);void load();
}
