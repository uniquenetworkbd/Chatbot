const { randomUUID, timingSafeEqual, createHash } = require("node:crypto");
function requestLogger(req,res,next){const t=process.hrtime.bigint(),id=randomUUID();res.setHeader("X-Request-Id",id);res.on("finish",()=>{const x={level:res.statusCode>=500?"error":res.statusCode>=400?"warn":"info",event:"http_request",requestId:id,method:req.method,path:req.path,status:res.statusCode,latencyMs:Number((Number(process.hrtime.bigint()-t)/1e6).toFixed(2)),ip:req.ip,timestamp:new Date().toISOString()},line=JSON.stringify(x);if(res.statusCode>=500)console.error(line);else if(res.statusCode>=400)console.warn(line);else console.log(line);});next();}
function errors(e,_q,res,_n){if(e?.message==="Origin not allowed by CORS")return res.status(403).json({error:"Origin not allowed"});if(e?.type==="entity.too.large")return res.status(413).json({error:"Request body too large"});if(e instanceof SyntaxError&&e.status===400&&"body"in e)return res.status(400).json({error:"Malformed JSON"});const s=Number.isInteger(e?.status)?e.status:500;if(s>=500)console.error(JSON.stringify({level:"error",event:"unhandled_error",message:e?.message||"Unknown",timestamp:new Date().toISOString(),stack:process.env.NODE_ENV==="production"?undefined:e?.stack}));res.status(s).json({error:s>=500?"Internal server error":e.message});}
function requireAdmin(req,res,next){
 const match=/^Bearer ([A-Za-z0-9_-]{40,})$/.exec(req.get("authorization")||"");
 if(!match)return res.status(401).json({error:"Unauthorized"});
 const db=req.app?.locals?.db;
 if(!db)return res.status(503).json({error:"Authentication service unavailable."});
 const tokenHash=createHash("sha256").update(match[1],"utf8").digest("hex");
 const session=db.prepare("SELECT s.expires_at,a.id,a.username FROM admin_sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=?").get(tokenHash);
 if(!session)return res.status(401).json({error:"Unauthorized"});
 if(Date.parse(session.expires_at)<=Date.now()){db.prepare("DELETE FROM admin_sessions WHERE token_hash=?").run(tokenHash);return res.status(401).json({error:"Session expired."});}
 req.admin={id:session.id,username:session.username,expiresAt:session.expires_at};
 req.adminTokenHash=tokenHash;
 next();
}
module.exports={requestLogger,errors,requireAdmin};
