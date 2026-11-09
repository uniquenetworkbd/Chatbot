import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const root=process.cwd();
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".mjs":"text/javascript"};
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);const target=path.resolve(root,"."+pathname);if(!target.startsWith(root+path.sep)&&target!==root)throw Error("invalid path");const info=await stat(target);const file=info.isDirectory()?path.join(target,"index.html"):target;res.writeHead(200,{"content-type":types[path.extname(file)]||"application/octet-stream"});res.end(await readFile(file));}catch{res.writeHead(404);res.end("Not found");}});
await new Promise(resolve=>server.listen(4174,"127.0.0.1",resolve));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1365,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 const state={conversations:[],messages:new Map(),next:1,token:"test-guest-token-abcdefghijklmnopqrstuvwxyz012345"};
 await page.addInitScript(()=>{window.UNBD_API_BASE_URL="https://api.test.invalid";});
 await page.route("https://api.test.invalid/**",async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname,method=req.method();
  const json=(status,data)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
  if(p==="/api/health")return json(200,{status:"ok",database:"ok"});
  if(p==="/api/conversations/guest-sessions"&&method==="POST")return json(201,{token:state.token,scope:"this-browser-profile"});
  if(p==="/api/conversations"&&method==="GET")return json(200,{conversations:state.conversations.filter(x=>x.status==="active").sort((a,b)=>b.updated_at.localeCompare(a.updated_at))});
  if(p==="/api/conversations"&&method==="POST"){const body=req.postDataJSON(),id="conversation-"+state.next++,row={id,title:body.title||"নতুন কথোপকথন",topic_id:body.topicId,status:"active",created_at:new Date().toISOString(),updated_at:new Date().toISOString()};state.conversations.push(row);state.messages.set(id,[]);return json(201,{conversation:row});}
  const match=p.match(/^\/api\/conversations\/([^/]+)(?:\/(messages|archive|restore|export))?$/);
  if(match){const [,id,action]=match,row=state.conversations.find(x=>x.id===id);if(!row)return json(404,{error:"not found"});
   if(action==="messages"&&method==="GET")return json(200,{conversation:row,messages:state.messages.get(id)||[]});
   if(action==="messages"&&method==="POST"){const body=req.postDataJSON(),items=state.messages.get(id);if(!items.some(x=>x.client_event_id===body.clientEventId))items.push({...body,id:"message-"+items.length,created_at:new Date().toISOString(),client_event_id:body.clientEventId});row.updated_at=new Date().toISOString();row.last_message=body.content;if(body.sender==="user"&&row.title==="নতুন কথোপকথন")row.title=body.content.slice(0,60);return json(201,{message:items.at(-1)});}
  }
  return json(404,{error:"unmocked route "+method+" "+p});
 });
 await page.goto("http://127.0.0.1:4174/",{waitUntil:"networkidle"});
 await page.waitForFunction(()=>Boolean(window.__unbdCurrentConversationId));
 const sidebar=page.locator("#app-sidebar");
 if(await sidebar.locator(".conversation-workspace,.history-search,.workspace-status").count())throw Error("Obsolete conversation controls remain inside menu");
 const plus=page.locator("#topic-menu-toggle");await plus.click();
 await page.getByRole("button",{name:/MikroTik ও ISP/}).click();
 const input=page.locator("#message-input");
 if(!(await input.inputValue()).startsWith("MikroTik ও ISP:"))throw Error("Selected topic prefix was not inserted");
 await input.fill("MikroTik ও ISP: PPPoE client offline");await input.press("Enter");
 await page.locator(".message.user").waitFor();await page.locator(".message.assistant").waitFor();
 await page.waitForFunction(()=>document.querySelectorAll(".message").length>=2);await page.waitForTimeout(300);
 if(![...state.messages.values()].some(items=>items.length===2))throw Error("Chat messages were not persisted through the mocked conversation API");
 await page.locator("#app-sidebar .nav-link[data-page='history']").click();await page.waitForURL(/layout\.html\?page=history/);
 const search=page.getByRole("searchbox",{name:"চ্যাট ইতিহাসে খুঁজুন"});await search.fill("PPPoE");
 if(await page.locator(".history-entry").count()!==1)throw Error("History page search did not filter the matching message");
 await search.fill("");await page.getByRole("button",{name:"বর্তমান চ্যাট আর্কাইভ করুন"}).click();
 await page.locator(".history-entry").waitFor({state:"detached"});
 await page.goto("http://127.0.0.1:4174/layout.html?page=archived",{waitUntil:"networkidle"});
 if(await page.locator(".archived-entry").count()!==1)throw Error("Archived page did not show the conversation");
 await page.getByRole("button",{name:"Restore"}).click();await page.waitForURL(/layout\.html\?page=history/);
 if(await page.locator(".history-entry").count()!==2)throw Error("Restore did not restore messages");
 await page.locator("#app-sidebar .nav-link[data-page='new-chat']").click();await page.waitForURL(/index\.html/);
 if(await page.evaluate(()=>JSON.parse(localStorage.getItem("unbd-chat-history-v1")||"[]").length)!==0)throw Error("New Chat did not start a clean local conversation");
 if(errors.length)throw Error("Browser runtime errors: "+errors.join(" | "));
 console.log("PASS: topic selection, API message persistence, History-page search, local archive/restore, clean New Chat and clean navigation.");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
