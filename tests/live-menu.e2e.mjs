import { chromium } from "playwright";
const site=(process.env.SITE_URL||"https://uniquenetworkbd.github.io/Chatbot").replace(/\/$/,"");
const browser=await chromium.launch({headless:true});
try{
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on("pageerror",e=>errors.push(e.message));
const home=await page.goto(site+"/",{waitUntil:"networkidle",timeout:60000});if(!home?.ok())throw Error("Live homepage HTTP "+home?.status());
await page.locator("#menu-toggle").click();const sidebar=page.locator("#app-sidebar");
const labels=await sidebar.locator(".nav-link .nav-label").allTextContents();
const expected=["চ্যাট","নতুন চ্যাট","Chatbot Profile","চ্যাট ইতিহাস","Archived","Network Tools","Settings","Admin Profile"];
if(JSON.stringify(labels)!==JSON.stringify(expected))throw Error("Live menu labels/order mismatch: "+JSON.stringify(labels));
if(await sidebar.locator(".conversation-workspace,.history-search,.workspace-status").count())throw Error("Live sidebar still contains conversation heading, search or backend status");
if((await sidebar.innerText()).includes("Backend endpoint পাওয়া যাচ্ছে না"))throw Error("Live backend endpoint error is shown in menu");
const heights=await sidebar.locator(".nav-link").evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().height)));
if(new Set(heights).size!==1)throw Error("Live menu buttons have inconsistent dimensions: "+heights.join(","));
const history=await page.request.get(site+"/layout.html?page=history"),archived=await page.request.get(site+"/layout.html?page=archived"),admin=await page.request.get(site+"/admin-profile.html");
if(!history.ok()||!archived.ok()||!admin.ok())throw Error("History, Archived or Admin Profile page is not deployed");
if(!(await admin.text()).includes("admin-profile.js"))throw Error("Admin Profile script is missing from deployed page");
if(errors.length)throw Error("Live browser errors: "+errors.join(" | "));
console.log("PASS: live menu has eight uniform full-width navigation items; no embedded conversation/search/backend error; History, Archived and Admin Profile pages are deployed.");
}finally{await browser.close();}
