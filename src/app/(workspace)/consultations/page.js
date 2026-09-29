import {requireSession} from "@/lib/auth";
import {requireConsultation} from "@/services/consultation.service";
import ConsultationWorkspace from "@/components/ConsultationWorkspace";
export default async function Page(){await requireSession("consultation.view");try{await requireConsultation();}catch(error){if(error.status===403)return <div className="card p-6"><h1 className="text-xl font-bold">Consultation is disabled</h1><p>Ask the owner to enable Consultation in Settings → Features. Historical records are preserved.</p></div>;throw error;}return <ConsultationWorkspace/>;}
