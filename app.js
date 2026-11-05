(() => {
  const $ = (id) => document.getElementById(id);
  const form = $("chatForm"), input = $("messageInput"), messages = $("messages");
  const welcome = $("welcome"), historyList = $("historyList");
  let conversations = load(), activeId = null, busy = false;

  function load(){ try { return JSON.parse(localStorage.getItem("uniquechat-conversations") || "[]"); } catch { return []; } }
  function save(){ localStorage.setItem("uniquechat-conversations", JSON.stringify(conversations)); renderHistory(); }
  function escapeHTML(value){ return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function current(){ return conversations.find(c => c.id === activeId); }
  function newChat(){ activeId = null; messages.innerHTML = ""; welcome.hidden = false; input.value = ""; input.focus(); renderHistory(); }
  function renderHistory(){
    historyList.innerHTML = "";
    if(!conversations.length){ historyList.innerHTML = '<p class="empty-history">Your conversations will appear here.</p>'; return; }
    conversations.slice().reverse().forEach(c => {
      const b = document.createElement("button"); b.className = "history-entry"; b.textContent = c.title || "New conversation";
      b.title = c.title || "New conversation"; b.addEventListener("click", () => openChat(c.id)); historyList.appendChild(b);
    });
  }
  function openChat(id){
    const c = conversations.find(x => x.id === id); if(!c) return;
    activeId = id; welcome.hidden = true; messages.innerHTML = "";
    c.messages.forEach(m => addMessage(m.role, m.text, false)); $("sidebar").classList.remove("open");
  }
  function addMessage(role, text, persist=true){
    welcome.hidden = true;
    const wrap = document.createElement("article"); wrap.className = "message " + role;
    const avatar = document.createElement("div"); avatar.className = "message-avatar"; avatar.textContent = role === "user" ? "YOU" : "U";
    const body = document.createElement("div"); body.className = "message-body";
    const meta = document.createElement("div"); meta.className = "message-meta"; meta.textContent = role === "user" ? "You" : "Unique Chat · Demo";
    const content = document.createElement("div"); content.className = "message-content"; content.textContent = text;
    body.append(meta, content); wrap.append(avatar, body); messages.appendChild(wrap);
    $("chatArea").scrollTop = $("chatArea").scrollHeight;
    if(persist){ const c = current(); if(c){ c.messages.push({role,text}); save(); } }
  }
  function makeReply(text){
    const s = text.toLowerCase();
    if(/hello|hi\b|hey|সালাম|হ্যালো|আসসালামু/.test(s)) return "Hello! Welcome to Unique Chat. This is a front-end demonstration, so I can show the chat experience but I am not connected to a live AI service yet.\n\nআপনি চাইলে ওয়েবসাইট, প্রজেক্ট পরিকল্পনা বা প্রযুক্তি বিষয়ে একটি প্রশ্ন লিখে পরীক্ষা করতে পারেন।";
    if(/website|ওয়েবসাইট|ওয়েবসাইট|html|css|javascript/.test(s)) return "A practical website workflow:\n\n1. Define the goal and target users.\n2. Plan the pages and content.\n3. Build the structure with HTML.\n4. Style the interface with CSS.\n5. Add interactions with JavaScript.\n6. Test mobile, desktop, accessibility and performance.\n7. Deploy and verify the live URL.\n\nNote: this is a local demo response, not a live AI-generated answer.";
    if(/plan|roadmap|পরিকল্পনা|চেকলিস্ট|checklist/.test(s)) return "Here is a simple starting checklist:\n\n• Write down the goal and expected result.\n• Break the work into small tasks.\n• Identify required tools and dependencies.\n• Build the smallest working version.\n• Test each feature and fix issues.\n• Document what is complete and what remains.\n\nThis prototype uses predefined local replies. Connect an authorised AI API through a secure backend to enable real AI responses.";
    if(/help|কীভাবে|কিভাবে|সহায়তা|সাহায্য/.test(s)) return "I can help demonstrate a conversational interface. Try asking about a website, a project checklist, or a simple roadmap.\n\nImportant: this repository currently contains a static HTML/CSS/JavaScript demo. No AI API, server, user authentication, or database is connected.";
    return "Thanks for your message! Your text was received successfully by the chat interface.\n\nThis is a working front-end prototype with local conversation history and sample replies. It does not yet connect to an AI model. To enable genuine AI conversations, the next step is a secure backend/API integration—never expose a private API key in browser JavaScript.\n\nআপনার মেসেজটি UI-তে সফলভাবে গ্রহণ করা হয়েছে।";
  }
  function send(text){
    text = text.trim(); if(!text || busy) return;
    if(!activeId){ activeId = String(Date.now()); conversations.push({id:activeId,title:text.slice(0,38),messages:[]}); }
    const c = current(); c.messages.push({role:"user",text}); addMessage("user",text,false); save(); input.value=""; resize();
    busy = true; $("sendBtn").disabled = true;
    const typing = document.createElement("article"); typing.className="message"; typing.innerHTML='<div class="message-avatar">U</div><div class="message-body"><div class="message-meta">Unique Chat</div><div class="message-content">Thinking<span class="dots"> ...</span></div></div>'; messages.appendChild(typing);
    setTimeout(() => { typing.remove(); const reply = makeReply(text); addMessage("bot",reply); busy=false; $("sendBtn").disabled=false; input.focus(); }, 550);
  }
  function resize(){ input.style.height="auto"; input.style.height=Math.min(input.scrollHeight,140)+"px"; }
  form.addEventListener("submit", e => { e.preventDefault(); send(input.value); });
  input.addEventListener("input", resize);
  input.addEventListener("keydown", e => { if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(input.value); } });
  $("newChatBtn").addEventListener("click",newChat);
  $("clearHistory").addEventListener("click",()=>{ if(confirm("Clear all locally saved conversations?")){ conversations=[]; save(); newChat(); } });
  $("themeBtn").addEventListener("click",()=>document.body.classList.toggle("light"));
  $("menuBtn").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
  $("historyNav").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
  document.querySelectorAll(".suggestion").forEach(b=>b.addEventListener("click",()=>send(b.dataset.prompt)));
  renderHistory();
})();