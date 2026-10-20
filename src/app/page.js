import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { workspaceHome } from "@/lib/workspace-access";
export default async function Home(){redirect(workspaceHome(await readSession()));}
