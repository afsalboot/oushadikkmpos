import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import NotificationsWorkspace from "@/components/NotificationsWorkspace";

export default async function NotificationsPage() {
  const session = await readSession();
  if (session?.role !== "ADMIN" && !session?.permissions?.includes("products.view")) redirect("/dashboard");
  return <NotificationsWorkspace />;
}
