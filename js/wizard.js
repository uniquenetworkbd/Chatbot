const FLOWS = {
  slow: { title: "ইন্টারনেট স্লো", steps: {
    start: { question: "সব ডিভাইসে কি ইন্টারনেট ধীর?", options: [{label:"হ্যাঁ, সব ডিভাইসে",next:"router"},{label:"না, একটি ডিভাইসে",next:"device"}] },
    router: { question: "রাউটার ও ONU-তে Power/PON স্বাভাবিক আছে?", options: [{label:"হ্যাঁ",next:"wired"},{label:"না / লাল LOS",next:"los"}] },
    device: { question: "Wi-Fi disconnect করে আবার connect করলে ঠিক হয়?", options: [{label:"হ্যাঁ",next:"resolved"},{label:"না",next:"device_check"}] },
    wired: { question: "LAN cable দিয়ে speed test করলেও কি ধীর?", options: [{label:"হ্যাঁ",next:"provider"},{label:"না, শুধু Wi-Fi",next:"wifi"}] },
    los: { question: "ONU-তে LOS লাল বা PON বন্ধ/ব্লিংক করছে?", options: [{label:"হ্যাঁ",next:"fiber"},{label:"না",next:"power"}] },
    fiber: { result:"ফাইবার/সিগন্যাল সমস্যা হতে পারে। ফাইবার কানেক্টর নাড়াচাড়া করবেন না; Support-এ OLT/ONU ও LOS status জানান।" },
    power: { result:"ONU power adapter ও indicator যাচাই করুন। কেবল খুলবেন না; সমস্যা থাকলে Support-এ জানান।" },
    provider: { result:"একাধিক ডিভাইসে wired speed কম হলে ISP-side congestion/line issue হতে পারে। সময়, package এবং speed test result Support-এ দিন।" },
    wifi: { result:"Wi-Fi coverage/interference সম্ভাব্য কারণ। রাউটারের কাছাকাছি পরীক্ষা করুন; 5 GHz/2.4 GHz band ও router placement যাচাই করুন।" },
    resolved: { result:"সমস্যা সাময়িকভাবে ঠিক হয়েছে। পুনরায় হলে সময় ও device model নোট করুন।" },
    device_check: { result:"একটি ডিভাইসের Wi-Fi driver, VPN, background download ও network settings পরীক্ষা করুন।" }
  }},
  los: { title:"ONU-তে Red LOS", steps: {
    start:{question:"ONU-তে LOS indicator কি লাল জ্বলছে বা blink করছে?",options:[{label:"হ্যাঁ",next:"fiber"},{label:"না",next:"pon"}]},
    fiber:{result:"Optical signal loss-এর সম্ভাবনা। ফাইবার খুলবেন/দেখবেন না। ONU-এর Power ও LOS অবস্থা লিখে ISP Support-এ যোগাযোগ করুন।"},
    pon:{question:"PON indicator স্থির সবুজ?",options:[{label:"হ্যাঁ",next:"internet"},{label:"না",next:"support"}]},
    internet:{result:"LOS নয়—Router WAN/PPPoE বা local Wi-Fi সমস্যা হতে পারে। Router WAN status যাচাই করুন।"},
    support:{result:"ONU registration/optical path পরীক্ষা প্রয়োজন। Serial/ONU label ও indicator-এর ছবি দিয়ে Support-এ জানান।"}
  }},
  billing: { title:"বিলের অমিল", steps: {
    start:{question:"আপনার বিলের অমিলটি কোন ধরনের?",options:[{label:"বিল বেশি এসেছে",next:"amount"},{label:"পেমেন্ট করেছি, বকেয়া দেখায়",next:"payment"},{label:"প্যাকেজ/মেয়াদ ভুল",next:"package"}]},
    amount:{result:"বর্তমান package, billing period ও পূর্বের due মিলিয়ে দেখুন। Bill ID ও amount দিয়ে Accounts Support-এ যাচাই চান।"},
    payment:{result:"Transaction ID, সময়, amount ও payment channel সংরক্ষণ করুন। একই বিল দ্বিতীয়বার পরিশোধ করবেন না; Accounts Support-এ reconciliation চান।"},
    package:{result:"আপনার package name, activation date ও মেয়াদ উল্লেখ করে billing record যাচাই করতে বলুন।"}
  }}
};
export function mountWizard(root) {
  if (!root || root.dataset.wizardReady === "true") return;
  root.dataset.wizardReady = "true";
  let flow = null, step = "start", trail = [];
  const title = document.createElement("h3"), question = document.createElement("p"), actions = document.createElement("div"), controls = document.createElement("div");
  actions.className = "wizard-options"; controls.className = "wizard-controls";
  const reset = () => { flow=null;step="start";trail=[];render(); };
  const render = () => {
    root.replaceChildren(title, question, actions, controls);
    title.textContent = flow ? FLOWS[flow].title : "কোন সমস্যাটি হচ্ছে?";
    question.textContent = flow ? (FLOWS[flow].steps[step].question || FLOWS[flow].steps[step].result) : "সমস্যার ধরন নির্বাচন করুন।";
    actions.replaceChildren(); controls.replaceChildren();
    if (!flow) {
      for (const [id,label] of [["slow","ইন্টারনেট স্লো"],["los","ONU Red LOS"],["billing","বিলের অমিল"]]) addAction(label,()=>{flow=id;step="start";trail=[];render();});
      return;
    }
    const current=FLOWS[flow].steps[step];
    if (current.result) {
      const done=document.createElement("p");done.className="wizard-result";done.textContent=current.result;actions.append(done);
      addAction("আবার শুরু করুন",reset);
    } else current.options.forEach(option=>addAction(option.label,()=>{trail.push(step);step=option.next;render();}));
    if (trail.length) addAction("আগের ধাপ",()=>{step=trail.pop();render();});
    addAction("সমস্যা বদলান",reset);
  };
  function addAction(label,callback){const button=document.createElement("button");button.type="button";button.className="tool-button";button.textContent=label;button.addEventListener("click",callback);actions.append(button);}
  render();
}
