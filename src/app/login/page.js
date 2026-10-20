import {redirect} from "next/navigation";import {readSession} from "@/lib/auth";import LoginForm from "@/components/LoginForm";
import {workspaceHome} from "@/lib/workspace-access";
export default async function LoginPage(){const session=await readSession();if(session)redirect(workspaceHome(session));return <LoginForm/>;}
