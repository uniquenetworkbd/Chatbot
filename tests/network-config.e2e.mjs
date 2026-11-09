import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root=process.cwd();
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);
    const file=normalize(join(root,pathname==="/"?"index.html":pathname.slice(1)));
    if(!file.startsWith(root)){res.writeHead(403).end();return;}
    res.writeHead(200,{"content-type":mime[extname(file)]||"application/octet-stream"});
    res.end(await readFile(file));
  }catch{res.writeHead(404).end("Not found");}
});
await new Promise(resolve=>server.listen(4177,"127.0.0.1",resolve));
const browser=await chromium.launch({headless:true});
const token="test-admin-session-token-abcdefghijklmnopqrstuvwxyz-123456";
const requests=[];
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("https://raw.githubusercontent.com/uniquenetworkbd/Chatbot/main/backend-url.json**",route=>route.fulfill({
    status:200,contentType:"application/json",
    body:JSON.stringify({schemaVersion:1,status:"active",url:"https://test-3000.app.github.dev",expiresAt:new Date(Date.now()+3600000).toISOString()})
  }));
  await page.route("https://test-3000.app.github.dev/**",async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    const json=(status,data)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
    if(path==="/api/health")return json(200,{status:"ok",database:"ok",service:"unique-network-chatbot-api",schemaVersion:5});
    if(path==="/api/auth/login"&&request.method()==="POST")return json(200,{token,tokenType:"Bearer",expiresAt:new Date(Date.now()+28800000).toISOString(),admin:{id:1}});
    if(path==="/api/auth/session")return json(200,{authenticated:true,admin:{id:1},expiresAt:new Date(Date.now()+28800000).toISOString()});
    if(path==="/api/network/connect-test"&&request.method()==="POST"){
      requests.push({authorization:request.headers()["authorization"]||"",body:request.postDataJSON()});
      if(requests.at(-1).body.snmpVersion==="v3")return json(422,{deviceType:"olt",status:"not_tested",check:"snmp_v3_not_configured",notice:"SNMPv3 not configured; no probe attempted."});
      return json(200,{deviceType:"router",status:"online",check:"routeros_api_ssl_authenticated",authentication:"authenticated",latencyMs:12,model:"Mock RouterOS device",version:"7.x",notice:"Mocked API integration response; no physical device was contacted."});
    }
    return json(404,{error:"Unmocked test route: "+request.method()+" "+path});
  });
  await page.goto("http://127.0.0.1:4177/layout.html?page=network-config",{waitUntil:"networkidle"});
  await page.locator("#auth-gateway").waitFor();
  await page.locator('#auth-gateway input[name="password"]').fill("test-only-password");
  await page.getByRole("button",{name:"Login"}).click();
  await page.getByRole("heading",{name:"Router & OLT Integration"}).waitFor();
  await page.locator('input[name="ipAddress"]').nth(0).fill("192.0.2.10");
  await page.locator('input[name="username"]').fill("test-router-user");
  await page.locator('input[name="password"]').fill("test-router-password");
  await page.getByRole("button",{name:"Test Live Connection & Handshake"}).click();
  await page.getByText("Mock RouterOS device").waitFor();
  if(requests.length!==1)throw new Error("Router connection test did not issue exactly one request");
  if(requests[0].authorization!=="Bearer "+token)throw new Error("Router test did not include the authenticated admin token");
  if(requests[0].body.ipAddress!=="192.0.2.10"||requests[0].body.port!==8729||requests[0].body.password!=="test-router-password")throw new Error("Router request payload was not preserved");
  if(await page.locator('input[name="password"]').inputValue()!=="")throw new Error("Router password field was not cleared after the attempt");
  await page.locator('input[name="ipAddress"]').nth(1).fill("192.0.2.20");
  await page.locator('select[name="snmpVersion"]').selectOption("v3");
  await page.getByRole("button",{name:"Test SNMP connection"}).click();
  await page.getByText("SNMPv3 not configured; no probe attempted.").waitFor();
  if(requests.length!==2||requests[1].body.snmpVersion!=="v3")throw new Error("SNMPv3 must be explicitly sent to the backend as not-tested, not silently downgraded");
  if(errors.length)throw new Error("Browser runtime errors: "+errors.join(" | "));
  console.log("PASS: admin-gated Network Config route; async backend discovery; authenticated Router API-SSL request; secret clearing; SNMPv3 remains explicitly not-tested. Backend responses were mocked; no physical router/OLT was contacted.");
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
