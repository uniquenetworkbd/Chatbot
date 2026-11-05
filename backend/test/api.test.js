const {test,before,after}=require("node:test"),assert=require("node:assert/strict"),{spawn}=require("node:child_process"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),net=require("node:net");let child,base,temp;const key="test-only-secret-key";function port(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once("error",reject);s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});});}async function ready(){for(let i=0;i<80;i++){try{const r=await fetch(base+"/api/health");if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error("API did not start");}before(async()=>{temp=fs.mkdtempSync(path.join(os.tmpdir(),"unbd-api-"));const p=await port();base="http://127.0.0.1:"+p;child=spawn(process.execPath,["server.js"],{cwd:path.resolve(__dirname,".."),env:{...process.env,PORT:String(p),HOST:"127.0.0.1",DB_PATH:path.join(temp,"test.sqlite"),ADMIN_API_KEY:key,NODE_ENV:"test"},stdio:"ignore"});await ready();});after(()=>{if(child&&child.exitCode===null)child.kill("SIGTERM");if(temp)fs.rmSync(temp,{recursive:true,force:true});});
test("health includes migration and disk metadata",async()=>{const r=await fetch(base+"/api/health"),d=await r.json();assert.equal(r.status,200);assert.equal(d.database,"ok");assert.equal(d.schemaVersion,2);assert.ok(d.storage.fileBytes>=0);});
test("chat logs persist and admin reads are protected",async()=>{const p={sessionId:"test-session-01",userMessage:"ইন্টারনেট সংযোগ নেই",botResponse:"ONU restart করুন",category:"internet"},w=await fetch(base+"/api/chat-logs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(p)});assert.equal(w.status,201);assert.equal((await fetch(base+"/api/chat-logs")).status,401);const r=await fetch(base+"/api/chat-logs?sessionId=test-session-01",{headers:{authorization:"Bearer "+key}}),d=await r.json();assert.equal(r.status,200);assert.equal(d.count,1);assert.equal(d.items[0].user_message,p.userMessage);});
test("client event ID makes chat write idempotent",async()=>{const p={clientEventId:"event-chat-0001",sessionId:"test-session-02",userMessage:"repeat",botResponse:"reply"},send=()=>fetch(base+"/api/chat-logs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(p)}),a=await(await send()).json(),b=await(await send()).json();assert.equal(a.id,b.id);assert.equal(b.duplicate,true);});
test("interaction writes persist and admin reads are protected",async()=>{const p={clientEventId:"event-int-0001",eventType:"chat_submitted",sessionId:"test-session-01",details:{source:"test"}},w=await fetch(base+"/api/interactions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(p)});assert.equal(w.status,201);assert.equal((await fetch(base+"/api/interactions")).status,401);const r=await fetch(base+"/api/interactions",{headers:{authorization:"Bearer "+key}}),d=await r.json();assert.equal(r.status,200);assert.equal(d.count,1);});
test("invalid fields and unexpected keys are rejected",async()=>{for(const body of [{sessionId:"test-session-01",userMessage:"",botResponse:"x"},{sessionId:"test-session-01",userMessage:"x",botResponse:"y",isAdmin:true}]){const r=await fetch(base+"/api/chat-logs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});assert.equal(r.status,400);}});
test("Pages CORS origin allowed and unknown origin rejected",async()=>{const good=await fetch(base+"/api/chat-logs",{method:"OPTIONS",headers:{origin:"https://uniquenetworkbd.github.io","access-control-request-method":"POST","access-control-request-headers":"content-type"}});assert.equal(good.status,204);assert.equal(good.headers.get("access-control-allow-origin"),"https://uniquenetworkbd.github.io");const bad=await fetch(base+"/api/chat-logs",{method:"OPTIONS",headers:{origin:"https://unapproved.example","access-control-request-method":"POST","access-control-request-headers":"content-type"}});assert.equal(bad.status,403);});

test("write requests are rate-limited by IP and session", async () => {
  const sessionId = "rate-session-0001";
  let last;
  for (let i = 1; i <= 13; i++) {
    last = await fetch(base + "/api/interactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientEventId: "rate-event-" + String(i).padStart(4, "0"),
        eventType: "rate_test",
        sessionId,
        details: { attempt: i }
      })
    });
    if (i < 13) assert.equal(last.status, 201);
  }
  assert.equal(last.status, 429);
});
