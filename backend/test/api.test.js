const {test,before,after}=require("node:test"),assert=require("node:assert/strict"),{spawn}=require("node:child_process"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),net=require("node:net"),{randomBytes,scryptSync}=require("node:crypto"),{openDatabase}=require("../database/connection");let child,base,temp,authToken;const username="testadmin",password="correct-horse-battery-staple";function port(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once("error",reject);s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});});}async function ready(){for(let i=0;i<80;i++){try{const r=await fetch(base+"/api/health");if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error("API did not start");}before(async()=>{temp=fs.mkdtempSync(path.join(os.tmpdir(),"unbd-api-"));const dbPath=path.join(temp,"test.sqlite");const setup=openDatabase(dbPath);const salt=randomBytes(16);const hash=["scrypt","16384","8","1",salt.toString("hex"),scryptSync(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString("hex")].join("$");setup.db.prepare("INSERT INTO admins(username,password_hash) VALUES(?,?)").run(username,hash);setup.db.close();const p=await port();base="http://127.0.0.1:"+p;child=spawn(process.execPath,["server.js"],{cwd:path.resolve(__dirname,".."),env:{...process.env,PORT:String(p),HOST:"127.0.0.1",DB_PATH:dbPath,NODE_ENV:"test",NETWORK_TARGETS_JSON:"[]"},stdio:"ignore"});await ready();const login=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username,password})});assert.equal(login.status,200);authToken=(await login.json()).token;});after(()=>{if(child&&child.exitCode===null)child.kill("SIGTERM");if(temp)fs.rmSync(temp,{recursive:true,force:true});});
test("auth session validates and logout revokes token",async()=>{const session=await fetch(base+"/api/auth/session",{headers:{authorization:"Bearer "+authToken}});assert.equal(session.status,200);const logout=await fetch(base+"/api/auth/logout",{method:"POST",headers:{authorization:"Bearer "+authToken}});assert.equal(logout.status,200);assert.equal((await fetch(base+"/api/auth/session",{headers:{authorization:"Bearer "+authToken}})).status,401);const again=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username,password})});assert.equal(again.status,200);authToken=(await again.json()).token;});
test("invalid login credentials are rejected",async()=>{const response=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username,password:"wrong-password"})});assert.equal(response.status,401);});
test("health includes migration and disk metadata",async()=>{const r=await fetch(base+"/api/health"),d=await r.json();assert.equal(r.status,200);assert.equal(d.database,"ok");assert.equal(d.schemaVersion,3);assert.ok(d.storage.fileBytes>=0);});
test("chat logs persist and admin reads are protected",async()=>{const p={sessionId:"test-session-01",userMessage:"ইন্টারনেট সংযোগ নেই",botResponse:"দুঃখিত, এই বিষয়টি আমার নলেজ বেসে নেই। সঠিক সহায়তার জন্য দয়া করে আমাদের মাইজদী সদর অফিসে যোগাযোগ করুন অথবা ফেসবুক পেজে ইনবক্স করুন।",category:"internet"},w=await fetch(base+"/api/chat-logs",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+authToken},body:JSON.stringify(p)});assert.equal(w.status,201);assert.equal((await fetch(base+"/api/chat-logs")).status,401);const r=await fetch(base+"/api/chat-logs?sessionId=test-session-01",{headers:{authorization:"Bearer "+authToken}}),d=await r.json();assert.equal(r.status,200);assert.equal(d.count,1);assert.equal(d.items[0].user_message,p.userMessage);});
test("client event ID makes chat write idempotent",async()=>{const p={clientEventId:"event-chat-0001",sessionId:"test-session-02",userMessage:"repeat",botResponse:"reply"},send=()=>fetch(base+"/api/chat-logs",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+authToken},body:JSON.stringify(p)}),a=await(await send()).json(),b=await(await send()).json();assert.equal(a.id,b.id);assert.equal(b.duplicate,true);});
test("interaction writes persist and admin reads are protected",async()=>{const p={clientEventId:"event-int-0001",eventType:"chat_submitted",sessionId:"test-session-01",details:{source:"test"}},w=await fetch(base+"/api/interactions",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+authToken},body:JSON.stringify(p)});assert.equal(w.status,201);assert.equal((await fetch(base+"/api/interactions")).status,401);const r=await fetch(base+"/api/interactions",{headers:{authorization:"Bearer "+authToken}}),d=await r.json();assert.equal(r.status,200);assert.equal(d.count,1);});
test("invalid fields and unexpected keys are rejected",async()=>{for(const body of [{sessionId:"test-session-01",userMessage:"",botResponse:"x"},{sessionId:"test-session-01",userMessage:"x",botResponse:"y",isAdmin:true}]){const r=await fetch(base+"/api/chat-logs",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+authToken},body:JSON.stringify(body)});assert.equal(r.status,400);}});
test("Pages CORS origin allowed and unknown origin rejected",async()=>{const good=await fetch(base+"/api/chat-logs",{method:"OPTIONS",headers:{origin:"https://uniquenetworkbd.github.io","access-control-request-method":"POST","access-control-request-headers":"content-type"}});assert.equal(good.status,204);assert.equal(good.headers.get("access-control-allow-origin"),"https://uniquenetworkbd.github.io");const bad=await fetch(base+"/api/chat-logs",{method:"OPTIONS",headers:{origin:"https://unapproved.example","access-control-request-method":"POST","access-control-request-headers":"content-type"}});assert.equal(bad.status,403);});

test("network status is explicitly simulated when no targets are configured", async () => {
  assert.equal((await fetch(base + "/api/network/status")).status, 401);
  const response = await fetch(base + "/api/network/status", { headers:{authorization:"Bearer "+authToken} });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.mode, "simulated");
  assert.equal(data.bandwidth.mode, "simulated");
  assert.ok(data.notice.includes("ডেমো"));
});
test("admin analytics requires session and returns unanswered queries", async () => {
  assert.equal((await fetch(base + "/api/admin/analytics")).status, 401);
  const response = await fetch(base + "/api/admin/analytics", { headers:{authorization:"Bearer "+authToken} });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.ok(data.totals.chats >= 1);
  assert.ok(data.unanswered.some(item => item.user_message === "ইন্টারনেট সংযোগ নেই"));
});

test("network connect-test requires admin auth and validates target ports", async () => {
  const endpoint = base + "/api/network/connect-test";
  const payload = { deviceType:"router", ipAddress:"192.0.2.10", username:"test", password:"never-log-this", port:8729 };
  assert.equal((await fetch(endpoint, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload) })).status, 401);
  const invalid = await fetch(endpoint, { method:"POST", headers:{"content-type":"application/json",authorization:"Bearer "+authToken}, body:JSON.stringify({...payload,port:22}) });
  assert.equal(invalid.status, 400);
  const plain = await fetch(endpoint, { method:"POST", headers:{"content-type":"application/json",authorization:"Bearer "+authToken}, body:JSON.stringify({...payload,port:8728}) });
  const plainData = await plain.json();
  assert.equal(plain.status, 200);
  assert.equal(plainData.authentication, "not_tested");
  const v3 = await fetch(endpoint, { method:"POST", headers:{"content-type":"application/json",authorization:"Bearer "+authToken}, body:JSON.stringify({deviceType:"olt",ipAddress:"192.0.2.20",port:161,snmpVersion:"v3"}) });
  const data = await v3.json();
  assert.equal(v3.status, 422);
  assert.equal(data.check, "snmp_v3_not_configured");
});

test("write requests are rate-limited by IP and session", async () => {
  const sessionId = "rate-session-0001";
  let last;
  for (let i = 1; i <= 13; i++) {
    last = await fetch(base + "/api/interactions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + authToken },
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

  let ipLimited;
  for (let i = 1; i <= 12; i++) {
    ipLimited = await fetch(base + "/api/interactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientEventId: "ip-event-" + String(i).padStart(4, "0"),
        eventType: "ip_rate_test",
        sessionId: "ip-session-" + String(i).padStart(4, "0"),
        details: { attempt: i }
      })
    });
    if (i < 12) assert.equal(ipLimited.status, 201);
  }
  assert.equal(ipLimited.status, 429);
});
