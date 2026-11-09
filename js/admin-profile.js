import { initializeNavigation } from "./navigation.js";
import { ensureAuthenticated, getCurrentAdmin, logout } from "./auth-session.js";

const root=document.getElementById("admin-profile-content");
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
function renderProfile(){
  if(!root)return;
  const admin=getCurrentAdmin();
  if(!admin){root.replaceChildren(el("p","page-description","Admin session পাওয়া যায়নি। আবার Login করুন।"));return;}
  const card=el("section","admin-profile-card"),heading=el("div","admin-profile-heading"),avatar=el("div","admin-avatar","A"),identity=el("div");
  identity.append(el("h2","", "Administrator"),el("p","","Unique Network BD · Admin Account"));
  heading.append(avatar,identity);
  const fields=el("div","admin-profile-fields");
  const values=[["Account ID",admin.id||"Unavailable"],["Session Expires",admin.expiresAt?new Date(admin.expiresAt).toLocaleString("bn-BD"):"Not provided"],["Authentication","Verified Admin Session"],["Session Storage","Current browser tab"]];
  for(const [label,value] of values){const field=el("div","admin-profile-field");field.append(el("small","",label),el("strong","",String(value)));fields.append(field);}
  const note=el("p","admin-profile-note","এই পেজে শুধু Backend থেকে যাচাইকৃত Admin Session-এর তথ্য দেখানো হয়। Username, Email, Avatar বা Password পরিবর্তনের জন্য প্রয়োজনীয় Profile API এখনো সংযুক্ত নেই।");
  const signout=el("button","admin-profile-logout","Log Out");signout.type="button";signout.addEventListener("click",()=>void logout());
  card.append(heading,fields,note,signout);root.replaceChildren(card);
}
async function initialize(){
  initializeNavigation();
  if(await ensureAuthenticated())renderProfile();
}
window.addEventListener("unbd:admin-authenticated",renderProfile);
void initialize();
