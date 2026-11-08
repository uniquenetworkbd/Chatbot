const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const Database=require("better-sqlite3");
const {restoreBackup}=require("../scripts/restore-backup");
test("offline restore validates backup and preserves a pre-restore copy",t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"unbd-restore-"));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const source=path.join(dir,"backup.sqlite"),target=path.join(dir,"live.sqlite");
 let db=new Database(source);db.exec("CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES('restored');");db.close();
 db=new Database(target);db.exec("CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES('old');");db.close();
 assert.throws(()=>restoreBackup({source,target}),/stopping the backend server/);
 const result=restoreBackup({source,target,allowOffline:true});assert.equal(result.integrity,"ok");assert.ok(result.safetyCopy);
 db=new Database(target,{readonly:true});assert.equal(db.prepare("SELECT value FROM sample").get().value,"restored");db.close();
 const prior=new Database(result.safetyCopy,{readonly:true});assert.equal(prior.prepare("SELECT value FROM sample").get().value,"old");prior.close();
});
