const fs=require("node:fs");
const path=require("node:path");
const Database=require("better-sqlite3");
function restoreBackup({source,target,allowOffline=false}){
 if(!allowOffline)throw new Error("Set ALLOW_OFFLINE_RESTORE=1 only after stopping the backend server.");
 const from=path.resolve(source),to=path.resolve(target);
 if(from===to||!fs.existsSync(from))throw new Error("A distinct existing backup file is required.");
 const check=new Database(from,{readonly:true,fileMustExist:true});
 try{const result=check.pragma("integrity_check",{simple:true});if(result!=="ok")throw new Error("Backup integrity check failed.");}
 finally{check.close();}
 fs.mkdirSync(path.dirname(to),{recursive:true});
 let safetyCopy=null;
 if(fs.existsSync(to)){safetyCopy=to+".pre-restore-"+Date.now();fs.copyFileSync(to,safetyCopy);}
 fs.copyFileSync(from,to);
 for(const suffix of ["-wal","-shm"])try{fs.rmSync(to+suffix,{force:true});}catch{}
 const restored=new Database(to,{readonly:true,fileMustExist:true});
 try{const result=restored.pragma("integrity_check",{simple:true});if(result!=="ok")throw new Error("Restored database integrity check failed.");}
 finally{restored.close();}
 return {target:to,safetyCopy,integrity:"ok"};
}
if(require.main===module){
 const source=process.argv[2],target=process.env.DB_PATH||path.join(__dirname,"..","data","database.sqlite");
 try{const result=restoreBackup({source,target,allowOffline:process.env.ALLOW_OFFLINE_RESTORE==="1"});console.log(JSON.stringify({event:"database_restore_completed",...result}));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={restoreBackup};
