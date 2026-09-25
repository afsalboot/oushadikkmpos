import {usesDatabaseBackupStorage} from "@/lib/backup-storage";
import {connectDb} from "@/lib/db";import {requireSession} from "@/lib/auth";import {ok,apiError} from "@/lib/api";
import {getSettings,updateSettings} from "@/services/settings.service";
const defaults={key:"global",storeName:"Oushadi",discount:{enabled:false,allowPercentage:true,allowFixed:true,maxStaffPercentage:10},roundOff:{enabled:false,method:"NEAREST_1"},customMix:{enabled:true,bottleRequired:true,autoSuggestBottle:true},invoice:{prefix:"INV",showMixIngredients:true},payments:{enabledMethods:["CASH","UPI","BANK"]}};
export async function GET(){try{const actor=await requireSession("settings.view");await connectDb();const settings=await getSettings()||defaults;settings._capabilities={role:actor.role,backupStorage:usesDatabaseBackupStorage()?"mongodb":"filesystem",edit:actor.role==="ADMIN"||actor.permissions.includes("settings.edit"),reset:actor.role==="ADMIN",audit:actor.role==="ADMIN"||actor.permissions.includes("settings.edit"),backup:actor.role==="ADMIN"};return ok(settings);}catch(e){return apiError(e);}}

export async function PATCH(request){try{const actor=await requireSession("settings.edit");await connectDb();return ok(await updateSettings(await request.json(),actor));}catch(error){return apiError(error);}}
export async function PUT(request){try{const actor=await requireSession("ADMIN");await connectDb();return ok(await updateSettings(await request.json(),actor));}catch(error){return apiError(error);}}
