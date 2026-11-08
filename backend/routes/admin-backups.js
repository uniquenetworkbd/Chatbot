const express=require("express");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const Database=require("better-sqlite3");
const {requireAdmin}=require("../middleware/security");
const router=express.Router();
const backupDir=path.resolve(process.env.BACKUP_DIR||path.join(__dirname,"..","data","backups"));
function checksum(file){const h=crypto.createHash("sha256");h.update(fs.readFileSync(file));return h.digest("hex");}
router.use(requireAdmin);
router.get("/",(req,res)=>{const rows=req.app.locals.db.prepare("SELECT id,file_name,file_size,checksum,status,created_at FROM backup_records ORDER BY id DESC LIMIT 100").all();res.json({backups:rows});});
router.post("/",async(req,res,next)=>{let file;try{fs.mkdirSync(backupDir,{recursive:true});const name="chatbot-"+new Date().toISOString().replace(/[:.]/g,"-")+"-"+crypto.randomUUID()+".sqlite";file=path.join(backupDir,name);await req.app.locals.db.backup(file);const stat=fs.statSync(file),digest=checksum(file);const result=req.app.locals.db.prepare("INSERT INTO backup_records(file_name,file_size,checksum,status) VALUES(?,?,?,'created')").run(name,stat.size,digest);res.status(201).json({id:Number(result.lastInsertRowid),fileName:name,fileSize:stat.size,checksum:digest,status:"created"});}catch(e){if(file)try{fs.rmSync(file,{force:true});}catch{}next(e);}});
router.post("/:id/verify",(req,res)=>{const row=req.app.locals.db.prepare("SELECT * FROM backup_records WHERE id=?").get(Number(req.params.id));if(!row)return res.status(404).json({error:"Backup not found"});const file=path.join(backupDir,row.file_name);let result="failed";try{if(!fs.existsSync(file)||path.dirname(path.resolve(file))!==backupDir)throw Error("Backup file missing");const db=new Database(file,{readonly:true,fileMustExist:true});try{const check=db.pragma("integrity_check",{simple:true});if(check!=="ok")throw Error("SQLite integrity check failed");if(checksum(file)!==row.checksum)throw Error("Backup checksum mismatch");result="verified";}finally{db.close();}}catch(e){req.app.locals.db.prepare("UPDATE backup_records SET status='failed' WHERE id=?").run(row.id);return res.status(422).json({status:"failed",error:e.message});}req.app.locals.db.prepare("UPDATE backup_records SET status=? WHERE id=?").run(result,row.id);res.json({id:row.id,status:result,integrity:"ok",checksum:"ok"});});
router.get("/:id/download",(req,res)=>{const row=req.app.locals.db.prepare("SELECT * FROM backup_records WHERE id=?").get(Number(req.params.id));if(!row)return res.status(404).json({error:"Backup not found"});const file=path.resolve(backupDir,row.file_name);if(path.dirname(file)!==backupDir||!fs.existsSync(file))return res.status(404).json({error:"Backup file unavailable"});res.download(file,row.file_name);});
module.exports=router;
