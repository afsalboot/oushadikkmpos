import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {ok,apiError} from "@/lib/api";
import {Doctor} from "@/models";
import {requireConsultation,consultationAllowed} from "@/services/consultation.service";
export async function GET(){try{const actor=await requireSession("consultation.view");await connectDb();const settings=await requireConsultation();return ok({doctors:await Doctor.find().select("name qualification consultationFee active").sort({name:1}).lean(),payments:{enabledMethods:settings.payments.enabledMethods,requireReference:Object.fromEntries(settings.payments.enabledMethods.map(method=>[method,Boolean(settings.payments[method.toLowerCase()]?.requireReference)]))},receipt:settings.receipt,store:settings.store,capabilities:{create:consultationAllowed(actor,"create"),cancel:consultationAllowed(actor,"cancel"),print:consultationAllowed(actor,"print"),overrideFee:consultationAllowed(actor,"overrideFee"),customers:actor.role==="ADMIN"||actor.permissions.includes("customers.view")}});}catch(error){return apiError(error);}}
