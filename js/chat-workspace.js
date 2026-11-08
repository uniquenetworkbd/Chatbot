import { getApiBaseUrl } from "./config.js";

const TOKEN_KEY="unbd-guest-token-v1";
const TOPICS=[
 {id:"network",label:"ইন্টারনেট ও নেটওয়ার্ক",description:"ইন্টারনেট সমস্যা, রাউটার, Wi-Fi"},
 {id:"mikrotik_isp",label:"MikroTik ও ISP",description:"PPPoE, RouterOS, OLT, ONU"},
 {id:"cybersecurity",label:"সাইবার নিরাপত্তা",description:"অনলাইন নিরাপত্তা ও অ্যাকাউন্ট সুরক্ষা"},
 {id:"computer",label:"কম্পিউটার ও প্রযুক্তি",description:"সফটওয়্যার, হার্ডওয়্যার, সমস্যা সমাধান"},
 {id:"webdev",label:"ওয়েব ডেভেলপমেন্ট",description:"HTML, CSS, JavaScript, Backend"},
 {id:"ai_automation",label:"AI ও অটোমেশন",description:"AI Tools, Chatbot, Automation"},
 {id:"company",label:"আমাদের সার্ভিস",description:"Unique Network BD-এর সেবা ও প্যাকেজ"},
 {id:"general",label:"সাধারণ প্রশ্ন",description:"অন্যান্য প্রশ্ন ও তথ্য"}
];
let token="",activeId="",saving=Promise.resolve();
const $=s=>document.querySelector(s);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
async function api(path,options={}){
 const base=await getApiBaseUrl();if(!base)throw new Error("Backend endpoint পাওয়া যাচ্ছে না");
 const response=await fetch(base+path,{...options,headers:{"Content-Type":"application/json","Authorization":"Bearer "+token,...(options.headers||{})},cache:"no-store"});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||"API request failed ("+response.status+")");
 return data;
}
async function ensureSession(){
 try{token=localStorage.getItem(TOKEN_KEY)||"";}catch{}
 if(token){try{await api("/api/conversations");return;}catch{token="";}}
 const base=await getApiBaseUrl();if(!base)throw new Error("Backend offline");
 const r=await fetch(base+"/api/conversations/guest-sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",cache:"no-store"});
 if(!r.ok)throw new Error("Guest session could not be created");
 const data=await r.json();token=data.token;localStorage.setItem(TOKEN_KEY,token);
}
function addComposerMenu(){
 const form=$("#chat-form"),input=$("#message-input");if(!form||!input||$("#topic-menu-toggle"))return;
 const toggle=el("button","topic-menu-toggle","+");toggle.id="topic-menu-toggle";toggle.type="button";toggle.setAttribute("aria-label","বিষয় নির্বাচন করুন");toggle.setAttribute("aria-expanded","false");
 const menu=el("div","topic-menu");menu.id="topic-menu";menu.hidden=true;menu.setAttribute("aria-label","আপনি কী বিষয়ে সাহায্য চান?");
 const heading=el("strong","topic-menu-heading","আপনি কী বিষয়ে সাহায্য চান?");
 menu.append(heading);
 TOPICS.forEach(topic=>{const b=el("button","topic-option");b.type="button";b.dataset.topicId=topic.id;const name=el("span","topic-option-name",topic.label),desc=el("small","topic-option-description",topic.description);b.append(name,desc);b.addEventListener("click",()=>{window.__unbdSelectedTopic={id:topic.id,label:topic.label};input.value=topic.label+": ";input.focus();input.setSelectionRange(input.value.length,input.value.length);menu.hidden=true;toggle.setAttribute("aria-expanded","false");});menu.append(b);});
 const clear=el("button","topic-clear","বিষয় সরান");clear.type="button";clear.addEventListener("click",()=>{window.__unbdSelectedTopic=null;input.value="";input.focus();menu.hidden=true;toggle.setAttribute("aria-expanded","false");});menu.append(clear);
 form.prepend(toggle);form.parentElement.insertBefore(menu,form);
 toggle.addEventListener("click",()=>{menu.hidden=!menu.hidden;toggle.setAttribute("aria-expanded",String(!menu.hidden));});
 document.addEventListener("click",e=>{if(!menu.contains(e.target)&&!toggle.contains(e.target)){menu.hidden=true;toggle.setAttribute("aria-expanded","false");}});
}
function renderConversations(rows,root){
 root.replaceChildren();
 if(!rows.length){root.append(el("p","history-empty","এখনো কোনো কথোপকথন নেই।"));return;}
 rows.forEach(row=>{
  const item=el("article","conversation-item"+(row.id===activeId?" is-active":""));
  const open=el("button","conversation-open");open.type="button";open.append(el("strong","conversation-title",row.title||"নতুন কথোপকথন"),el("small","conversation-preview",row.last_message||row.updated_at||""));open.addEventListener("click",()=>void loadConversation(row.id));item.append(open);
  const actions=el("div","conversation-actions");
  const rename=el("button","conversation-action","নাম");rename.type="button";rename.title="Rename";rename.addEventListener("click",async()=>{const title=window.prompt("কথোপকথনের নতুন নাম",row.title);if(!title?.trim())return;try{await api("/api/conversations/"+row.id,{method:"PATCH",body:JSON.stringify({title:title.trim()})});await refreshHistory();}catch(e){notify(e.message);}});actions.append(rename);
  const archive=el("button","conversation-action","আর্কাইভ");archive.type="button";archive.addEventListener("click",async()=>{try{await api("/api/conversations/"+row.id+"/archive",{method:"POST",body:"{}"});if(activeId===row.id)await createConversation();await refreshHistory();}catch(e){notify(e.message);}});actions.append(archive);
  const exportButton=el("button","conversation-action","Export");exportButton.type="button";exportButton.addEventListener("click",()=>void exportConversation(row.id));actions.append(exportButton);
  item.append(actions);root.append(item);
 });
}
function notify(message){const node=$("#workspace-status");if(node)node.textContent=message;}
async function refreshHistory(query=""){
 const root=$("#conversation-history-list");if(!root||!token)return;
 try{
  const data=query?await api("/api/conversations/search?q="+encodeURIComponent(query)):await api("/api/conversations");
  renderConversations(query?data.results:data.conversations,root);
 }catch(e){notify("History sync: "+e.message);}
}
async function createConversation(){
 const data=await api("/api/conversations",{method:"POST",body:JSON.stringify({title:"নতুন কথোপকথন",topicId:window.__unbdSelectedTopic?.id||null})});
 activeId=data.conversation.id;window.__unbdSelectedTopic=null;
 window.dispatchEvent(new CustomEvent("unbd:conversation-load",{detail:{id:activeId,messages:[]}}));
 await refreshHistory();return activeId;
}
async function loadConversation(id){
 try{
  const data=await api("/api/conversations/"+id+"/messages");activeId=id;
  window.dispatchEvent(new CustomEvent("unbd:conversation-load",{detail:{id,messages:data.messages}}));
  await refreshHistory();notify("কথোপকথন লোড হয়েছে");
 }catch(e){notify(e.message);}
}
async function persistMessage(detail){
 if(!activeId)return;
 const eventId=(globalThis.crypto?.randomUUID?.()||("event-"+Date.now()+"-"+Math.random().toString(36).slice(2))).replace(/[^a-zA-Z0-9_-]/g,"");
 try{await api("/api/conversations/"+activeId+"/messages",{method:"POST",body:JSON.stringify({sender:detail.role,content:detail.text,topicId:detail.topicId||null,clientEventId:eventId})});await refreshHistory();}
 catch(e){notify("বার্তা সার্ভারে সংরক্ষণ হয়নি: "+e.message);}
}
async function exportConversation(id){
 try{const data=await api("/api/conversations/"+id+"/export");const blob=new Blob(["\\uFEFF",JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"});const url=URL.createObjectURL(blob);const a=el("a");a.href=url;a.download="unbd-conversation-"+id+".json";document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);}
 catch(e){notify("Export failed: "+e.message);}
}
function addSidebarTools(){
 const sidebar=$("#app-sidebar");if(!sidebar||$("#conversation-workspace"))return;
 const section=el("section","conversation-workspace");section.id="conversation-workspace";
 const top=el("div","conversation-workspace-top");top.append(el("strong","","কথোপকথন"));
 const fresh=el("button","new-chat-button","+ New Chat");fresh.type="button";fresh.addEventListener("click",async()=>{try{await createConversation();notify("নতুন কথোপকথন শুরু হয়েছে");}catch(e){notify(e.message);}});top.append(fresh);section.append(top);
 const search=el("input","history-search");search.type="search";search.placeholder="পুরোনো চ্যাট খুঁজুন...";search.setAttribute("aria-label","কথোপকথন খুঁজুন");let timer;search.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(()=>void refreshHistory(search.value.trim()),180);});section.append(search);
 const list=el("div","conversation-history-list");list.id="conversation-history-list";section.append(list);
 const status=el("small","workspace-status");status.id="workspace-status";status.textContent="History সংযোগ হচ্ছে...";section.append(status);
 sidebar.insertBefore(section,sidebar.querySelector(".sidebar-footer"));
}
async function initialize(){
 addComposerMenu();addSidebarTools();
 const form=$("#chat-form");form?.addEventListener("submit",()=>{const topic=window.__unbdSelectedTopic?.id||null;const original=$("#message-input")?.value||"";window.__unbdPendingTopic=topic;window.__unbdPendingText=original;});
 window.addEventListener("unbd:message",event=>{const detail=event.detail||{};detail.topicId=detail.topicId||window.__unbdPendingTopic||window.__unbdSelectedTopic?.id||null;saving=saving.then(()=>persistMessage(detail));});
 try{
  await ensureSession();const data=await api("/api/conversations");await refreshHistory();
  if(data.conversations.length){await loadConversation(data.conversations[0].id);}
  else{
   const legacy=Array.from($("#message-list")?.querySelectorAll(".message")||[]).map(n=>({sender:n.classList.contains("user")?"user":"assistant",content:n.querySelector(".message-body")?.textContent||n.textContent}));
   await createConversation();
   for(const m of legacy){const id=(globalThis.crypto?.randomUUID?.()||"legacy-"+Date.now()).replace(/[^a-zA-Z0-9_-]/g,"");await api("/api/conversations/"+activeId+"/messages",{method:"POST",body:JSON.stringify({...m,clientEventId:id})});}
   await refreshHistory();
  }
  notify("History সংরক্ষণ সক্রিয় · এই ব্রাউজার প্রোফাইল");
 }catch(e){notify("Backend unavailable — এই সেশনে server history সক্রিয় নয়: "+e.message);}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>void initialize(),{once:true});else void initialize();
