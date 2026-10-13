import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, apiError } from "@/lib/api";
import { getAccountData } from "@/services/account-data.service";
import {queryValues} from "@/lib/filter-utils";
import { requestTiming } from "@/lib/performance";

export async function GET(request){
  const timing=requestTiming('accounts');
  try{
    await timing.measure('auth',()=>requireSession("accounts"));
    await timing.measure('connection',()=>connectDb());
    const parameters=new URL(request.url).searchParams;
    const optionNames=["search","direction","transactionType","paymentMethod","source","dateFrom","dateTo","sort","order","page","limit"];
    const multiValueNames=new Set(["transactionType","paymentMethod","source"]);
    const options=Object.fromEntries(optionNames.map((name)=>[name,multiValueNames.has(name)?queryValues(parameters,name):parameters.get(name)||""]));
    const data=await getAccountData(options,timing);
    return timing.finish(await timing.measure('serialization',()=>ok(data)));
  }catch(error){return timing.finish(apiError(error));}
}
