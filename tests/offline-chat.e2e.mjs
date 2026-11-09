import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root=process.cwd();
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);
    const target=path.resolve(root,"."+pathname);
    if(!target.startsWith(root+path.sep)&&target!==root)throw Error("invalid path");
    const info=await stat(target),file=info.isDirectory()?path.join(target,"index.html"):target;
    res.writeHead(200,{"content-type":mime[path.extname(file)]||"application/octet-stream"});
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end("Not found");}
});
await new Promise(resolve=>server.listen(4176,"127.0.0.1",resolve));
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("https://raw.githubusercontent.com/uniquenetworkbd/Chatbot/main/backend-url.json**",route=>route.fulfill({
    status:200,contentType:"application/json",
    body:JSON.stringify({schemaVersion:1,status:"inactive",url:null})
  }));
  await page.goto("http://127.0.0.1:4176/",{waitUntil:"networkidle"});
  const input=page.locator("#message-input");
  await input.fill("ইন্টারনেটের গতি কম");
  await input.press("Enter");
  await page.locator(".message.user").waitFor();
  await page.locator(".message.assistant").waitFor();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("unbd-chat-history-v1")||"[]").length===2);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("unbd-chat-history-v1")||"[]"));
  if(saved[0].role!=="user"||saved[1].role!=="assistant")throw Error("Offline chat transcript was not saved in the expected order");
  await page.reload({waitUntil:"networkidle"});
  await page.locator(".message.user").waitFor();
  await page.locator(".message.assistant").waitFor();
  if(await page.locator(".message").count()!==2)throw Error("Offline transcript did not survive a browser reload");
  await page.locator("#menu-toggle").click();
  const menuText=await page.locator("#app-sidebar").innerText();
  if(menuText.includes("Backend endpoint পাওয়া যাচ্ছে না")||menuText.includes("Backend unavailable"))throw Error("Backend diagnostic leaked into the navigation menu");
  if(errors.length)throw Error("Browser runtime errors: "+errors.join(" | "));
  console.log("PASS: backend-unavailable chat remains usable; local transcript survives reload; navigation menu contains no backend diagnostic.");
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
