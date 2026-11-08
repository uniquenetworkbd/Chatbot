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
  if(p==="/api/conversations"&&method==="POST"){const body=req.postDataJSON(),id="conversation-"+state.next++;const row={id,title:body.title||"নতুন কথোপকথন",topic_id:body.topicId,status:"active",created_at:new Date().toISOString(),updated_at:new Date().toISOString()};state.conversations.push(row);state.messages.set(id,[]);return json(201,{conversation:row});}
  if(p==="/api/conversations/search")return json(200,{results:state.conversations.filter(x=>x.title.toLowerCase().includes((url.searchParams.get("q")||"").toLowerCase()))});
  if(p==="/api/conversations/archived/list")return json(200,{conversations:state.conversations.filter(x=>x.status==="archived")});
  const match=p.match(/^\/api\/conversations\/([^/]+)(?:\/(messages|archive|restore|export))?$/);
  if(match){const [,id,action]=match,row=state.conversations.find(x=>x.id===id);if(!row)return json(404,{error:"not found"});
   if(action==="messages"&&method==="GET")return json(200,{conversation:row,messages:state.messages.get(id)||[]});
   if(action==="messages"&&method==="POST"){const body=req.postDataJSON(),items=state.messages.get(id);if(!items.some(x=>x.client_event_id===body.clientEventId))items.push({...body,id:"message-"+items.length,created_at:new Date().toISOString(),client_event_id:body.clientEventId});row.updated_at=new Date().toISOString();row.last_message=body.content;if(body.sender==="user"&&row.title==="নতুন কথোপকথন")row.title=body.content.slice(0,60);return json(201,{message:items.at(-1)});}
   if(action==="archive"&&method==="POST"){row.status="archived";return json(200,{success:true,status:"archived"});}
   if(action==="restore"&&method==="POST"){row.status="active";return json(200,{success:true,status:"active"});}
   if(action==="export")return json(200,{conversation:row,messages:state.messages.get(id)||[]});
   if(!action&&method==="PATCH"){row.title=req.postDataJSON().title;return json(200,{conversation:row});}
  }
  return json(404,{error:"unmocked route "+method+" "+p});
 });
 await page.goto("http://127.0.0.1:4174/",{waitUntil:"networkidle"});
 await page.locator("#workspace-status").waitFor();
 await page.waitForFunction(()=>document.querySelector("#workspace-status")?.textContent.includes("History সংরক্ষণ সক্রিয়"));
 const plus=page.locator("#topic-menu-toggle");await plus.click();
 await page.getByRole("button",{name:/MikroTik ও ISP/}).click();
 const input=page.locator("#message-input");
 if(!(await input.inputValue()).startsWith("MikroTik ও ISP:"))throw Error("Selected topic prefix was not inserted");
 await input.fill("MikroTik ও ISP: PPPoE client offline");
 await input.press("Enter");
 await page.locator(".message.user").waitFor();
 await page.locator(".message.assistant").waitFor();
 await page.waitForFunction(()=>document.querySelectorAll(".message").length>=2);
 await page.waitForTimeout(350);
 if(![...state.messages.values()].some(items=>items.length===2))throw Error("User and assistant messages were not persisted through API");
 await page.locator(".history-search").fill("PPPoE");
 await page.waitForTimeout(250);
 await page.locator(".history-search").fill("");
 await page.getByRole("button",{name:"+ New Chat"}).click();
 await page.waitForFunction(()=>document.querySelectorAll(".conversation-item").length>=2);
 if(state.conversations.filter(x=>x.status==="active").length<2)throw Error("New Chat did not create a separate conversation");
 const target=state.conversations.find(row=>row.title.includes("PPPoE"));
 if(!target)throw Error("Saved topic conversation could not be identified");
 const targetItem=page.locator('[data-conversation-id="'+target.id+'"]');
 await page.waitForResponse(response=>response.url().includes("/api/conversations")&&response.request().method()==="GET");
 await targetItem.locator(".conversation-action",{hasText:"আর্কাইভ"}).click();
 await page.waitForResponse(response=>response.url().includes("/archive")&&response.request().method()==="POST");
 await page.getByRole("button",{name:"Archived"}).click();
 await page.waitForResponse(response=>response.url().includes("/archived/list"));
 const archivedItem=page.locator('[data-conversation-id="'+target.id+'"]');
 await archivedItem.locator(".conversation-action",{hasText:"Restore"}).click();
 await page.waitForResponse(response=>response.url().includes("/restore")&&response.request().method()==="POST");
 await page.getByRole("button",{name:"+ New Chat"}).click();
 if(errors.length)throw Error("Browser runtime errors: "+errors.join(" | "));
 console.log("PASS: Plus menu topic insertion, separate conversations, message persistence, history search, archive and restore.");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
