export async function register(){
  if(process.env.NEXT_RUNTIME!=="nodejs")return;
  const {startBackupScheduler}=await import("./src/services/backup.service.js");
  startBackupScheduler();
}
