import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import ChangePasswordForm from "@/components/ChangePasswordForm";

export default async function ChangePasswordPage() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (!session.mustChangePassword) redirect("/dashboard");
  return <ChangePasswordForm />;
}
