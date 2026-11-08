const {createHash}=require("node:crypto");
function requireGuest(req,res,next){
 const match=/^Bearer ([A-Za-z0-9_-]{40,})$/.exec(req.get("authorization")||"");
 if(!match)return res.status(401).json({error:"Guest session required"});
 const hash=createHash("sha256").update(match[1],"utf8").digest("hex");
 const guest=req.app.locals.db.prepare("SELECT id FROM guest_sessions WHERE token_hash=?").get(hash);
 if(!guest)return res.status(401).json({error:"Guest session is invalid"});
 req.guest={id:guest.id};
 req.app.locals.db.prepare("UPDATE guest_sessions SET last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(guest.id);
 next();
}
module.exports={requireGuest};
