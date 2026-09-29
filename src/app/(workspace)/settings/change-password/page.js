import Link from "next/link";
import { requireSession } from "@/lib/auth";
import ChangePasswordForm from "@/components/ChangePasswordForm";
export default async function Page() {
  await requireSession();
  return <div className="space-y-4"><Link className="btn" href="/settings">Back to Settings</Link><ChangePasswordForm embedded /></div>;
}
