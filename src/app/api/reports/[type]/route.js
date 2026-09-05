import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {apiError,fail,ok} from "@/lib/api";
import {getReport,REPORT_PERMISSIONS,reportCsv} from "@/services/report.service";

export async function GET(request,{params}){
  try{
    const{type}=await params,permission=REPORT_PERMISSIONS[type];
    if(!permission)return fail("Unknown report",404);
    const actor=await requireSession("reports.view");
    if(permission!=="view")await requireSession(`reports.${permission}`);
    const parameters=new URL(request.url).searchParams;
    if(parameters.get("format")==="csv")await requireSession("reports.export");
    if(parameters.get("format")==="csv"){parameters.set("page","1");parameters.set("limit","1000");}
    await connectDb();
    const report=await getReport(type,parameters);
    report.access={allowed:Object.entries(REPORT_PERMISSIONS).filter(([,action])=>action==="view"||actor.role==="ADMIN"||actor.permissions.includes(`reports.${action}`)).map(([name])=>name),canExport:actor.role==="ADMIN"||actor.permissions.includes("reports.export")};
    if(parameters.get("format")==="csv")return new Response(reportCsv(report),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="oushadi-${type}-report.csv"`}});
    return ok(report);
  }catch(error){return apiError(error);}
}
