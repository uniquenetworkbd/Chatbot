const express=require("express");
const {randomBytes,createHash,randomUUID}=require("node:crypto");
const {requireGuest}=require("../middleware/guest-session");
const router=express.Router();
const hash=t=>createHash("sha256").update(t,"utf8").digest("hex");
const validText=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=max&&!/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]/.test(v);
function owned(db,id,guestId){return db.prepare("SELECT * FROM conversations WHERE id=? AND guest_session_id=?").get(id,guestId);}
router.post("/guest-sessions",(req,res)=>{
 const token=randomBytes(32).toString("base64url");
 const result=req.app.locals.db.prepare("INSERT INTO guest_sessions(token_hash) VALUES(?)").run(hash(token));
 res.set("Cache-Control","no-store").status(201).json({token,scope:"this-browser-profile",guestSessionId:Number(result.lastInsertRowid)});
});
router.use(requireGuest);
router.get("/",(req,res)=>{
 const rows=req.app.locals.db.prepare("SELECT c.id,c.title,c.topic_id,c.status,c.created_at,c.updated_at,c.last_message_at,(SELECT content FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.rowid DESC LIMIT 1) AS last_message FROM conversations c WHERE c.guest_session_id=? AND c.status='active' ORDER BY c.updated_at DESC LIMIT 200").all(req.guest.id);
 res.json({conversations:rows});
});
router.post("/",(req,res)=>{
 const title=validText(req.body?.title,120)?req.body.title.trim():"নতুন কথোপকথন";
 const topic=validText(req.body?.topicId,80)?req.body.topicId:null;
 const id=randomUUID(),db=req.app.locals.db;
 db.prepare("INSERT INTO conversations(id,guest_session_id,title,topic_id) VALUES(?,?,?,?)").run(id,req.guest.id,title,topic);
 res.status(201).json({conversation:owned(db,id,req.guest.id)});
});
router.get("/search",(req,res)=>{
 const q=String(req.query.q||"").trim().slice(0,120);
 if(q.length<2)return res.json({results:[]});
 const results=req.app.locals.db.prepare("SELECT DISTINCT c.id,c.title,c.topic_id,c.status,c.updated_at FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id WHERE c.guest_session_id=? AND (c.title LIKE ? OR m.content LIKE ?) ORDER BY c.updated_at DESC LIMIT 50").all(req.guest.id,"%"+q+"%","%"+q+"%");
 res.json({results});
});
router.get("/:id/export",(req,res)=>{
 const db=req.app.locals.db,c=owned(db,req.params.id,req.guest.id);
 if(!c)return res.status(404).json({error:"Conversation not found"});
 const messages=db.prepare("SELECT id,sender,content,topic_id,created_at FROM messages WHERE conversation_id=? ORDER BY created_at,rowid").all(c.id);
 res.set("Content-Disposition",'attachment; filename="conversation-'+c.id+'.json"').json({conversation:c,messages});
});
router.get("/:id/messages",(req,res)=>{
 const db=req.app.locals.db,c=owned(db,req.params.id,req.guest.id);
 if(!c)return res.status(404).json({error:"Conversation not found"});
 res.json({conversation:c,messages:db.prepare("SELECT id,sender,content,topic_id,created_at FROM messages WHERE conversation_id=? ORDER BY created_at,rowid").all(c.id)});
});
router.post("/:id/messages",(req,res)=>{
 const db=req.app.locals.db,c=owned(db,req.params.id,req.guest.id);
 if(!c)return res.status(404).json({error:"Conversation not found"});
 const {sender,content,topicId,clientEventId}=req.body||{};
 if(!["user","assistant"].includes(sender)||!validText(content,8000)||!validText(clientEventId,100))return res.status(400).json({error:"Invalid message payload"});
 const id=randomUUID();
 const result=db.prepare("INSERT OR IGNORE INTO messages(id,conversation_id,sender,content,topic_id,client_event_id) VALUES(?,?,?,?,?,?)").run(id,c.id,sender,content.trim(),validText(topicId,80)?topicId:null,clientEventId);
 const saved=db.prepare("SELECT id,sender,content,topic_id,created_at FROM messages WHERE conversation_id=? AND client_event_id=?").get(c.id,clientEventId);
 db.prepare("UPDATE conversations SET topic_id=COALESCE(?,topic_id),last_message_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(validText(topicId,80)?topicId:null,c.id);
 if(sender==="user"&&c.title==="নতুন কথোপকথন")db.prepare("UPDATE conversations SET title=? WHERE id=?").run(content.trim().slice(0,60),c.id);
 res.status(result.changes?201:200).json({message:saved,duplicate:result.changes===0});
});
router.patch("/:id",(req,res)=>{
 const db=req.app.locals.db,c=owned(db,req.params.id,req.guest.id);
 if(!c)return res.status(404).json({error:"Conversation not found"});
 const {title}=req.body||{};
 if(!validText(title,120))return res.status(400).json({error:"Title must contain 1-120 characters"});
 db.prepare("UPDATE conversations SET title=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(title.trim(),c.id);
 res.json({conversation:owned(db,c.id,req.guest.id)});
});
router.post("/:id/archive",(req,res)=>setArchive(req,res,"archived"));
router.post("/:id/restore",(req,res)=>setArchive(req,res,"active"));
function setArchive(req,res,status){
 const db=req.app.locals.db,c=owned(db,req.params.id,req.guest.id);
 if(!c)return res.status(404).json({error:"Conversation not found"});
 db.prepare("UPDATE conversations SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(status,c.id);
 res.json({success:true,status});
}
router.get("/archived/list",(req,res)=>{
 const rows=req.app.locals.db.prepare("SELECT id,title,topic_id,status,created_at,updated_at,last_message_at FROM conversations WHERE guest_session_id=? AND status='archived' ORDER BY updated_at DESC LIMIT 200").all(req.guest.id);
 res.json({conversations:rows});
});
module.exports=router;
