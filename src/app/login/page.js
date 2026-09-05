import {redirect} from "next/navigation";import {readSession} from "@/lib/auth";import LoginForm from "@/components/LoginForm";
export default async function LoginPage(){const session=await readSession();if(session)redirect(session.mustChangePassword?"/change-password":"/dashboard");return <LoginForm/>;}
