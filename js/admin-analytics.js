import { getApiBaseUrl } from "./config.js";
import { authHeaders } from "./auth-session.js";
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
export function initializeAdminAnalytics(root){
 if(!root||root.dataset.analyticsReady==="true")return;root.dataset.analyticsReady="true";
 const load=node("button","Load analytics","tool-button");load.type="button";
 const status=node("p","Authenticated admin session required.","tool-notice"),summary=node("div",undefined,"analytics-grid"),unanswered=node("div"),categories=node("div"),daily=node("div");
 const toolbar=node("div",undefined,"admin-toolbar");toolbar.append(load);
 root.replaceChildren(node("h2","Admin Analytics"),node("p","Protected metrics from the self-hosted SQLite log database."),toolbar,status,summary,node("h3","Unanswered queries"),unanswered,node("h3","Categories"),categories,node("h3","Daily chats (last 14 days)"),daily);
 async function refresh(){const base=getApiBaseUrl();if(!base){status.textContent="Backend URL is not configured.";return;}load.disabled=true;status.textContent="Loading…";
 try{const response=await fetch(base+"/api/admin/analytics",{headers:authHeaders(),cache:"no-store",credentials:"omit"});if(response.status===401)throw Error("Session expired. Please log in again.");if(!response.ok)throw Error("Analytics API HTTP "+response.status);const d=await response.json();
 summary.replaceChildren();for(const [label,value] of [["Total chats",d.totals.chats],["Interactions",d.totals.interactions],["Sessions",d.totals.sessions]]){const card=node("article",undefined,"metric-card");card.append(node("span",label),node("strong",String(value)));summary.append(card);}
 unanswered.replaceChildren();if(!d.unanswered.length)unanswered.append(node("p","No unanswered queries found."));for(const item of d.unanswered){const card=node("article",undefined,"query-card");card.append(node("strong",item.user_message),node("small",item.created_at+" · "+item.session_id));unanswered.append(card);}
 categories.replaceChildren();for(const item of d.categories)categories.append(node("p",item.category+" — "+item.total));
 daily.replaceChildren();for(const item of d.daily)daily.append(node("p",item.day+" — "+item.total));
 status.textContent="Updated "+d.generatedAt;
 }catch(e){status.textContent=e.message;}finally{load.disabled=false;}}
 load.addEventListener("click",refresh);void refresh();
}
