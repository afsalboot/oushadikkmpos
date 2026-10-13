import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {apiError,fail,ok} from "@/lib/api";
import {getReport,REPORT_PERMISSIONS,reportCsv} from "@/services/report.service";
import {requestTiming} from "@/lib/performance";

export async function GET(request,{params}){
  const timing=requestTiming('report');
  try{
    const{type}=await params,permission=REPORT_PERMISSIONS[type];
    if(!permission)return fail("Unknown report",404);
    const actor=await timing.measure('auth',()=>requireSession("reports.view"));
    if(permission!=="view")await requireSession(`reports.${permission}`);
    const parameters=new URL(request.url).searchParams;
    if(parameters.get("format")==="csv")await requireSession("reports.export");
    if(parameters.get("format")==="csv"){parameters.set("page","1");parameters.set("limit","1000");}
    await timing.measure('connection',()=>connectDb());
    const report=await timing.measure('report_data',()=>getReport(type,parameters));
    if (actor.role !== "ADMIN" && !actor.permissions.includes("reports.profitability")) {
      report.kpis = report.kpis.filter(kpi => !["External Purchase Cost", "External Purchase Profit"].includes(kpi.label));
    }
    report.access={allowed:Object.entries(REPORT_PERMISSIONS).filter(([,action])=>action==="view"||actor.role==="ADMIN"||actor.permissions.includes(`reports.${action}`)).map(([name])=>name),canExport:actor.role==="ADMIN"||actor.permissions.includes("reports.export")};
    if(parameters.get("format")==="csv")return timing.finish(new Response(reportCsv(report),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="oushadi-${type}-report.csv"`}}));
    return timing.finish(await timing.measure('serialization',()=>ok(report)));
  }catch(error){return timing.finish(apiError(error));}
}
