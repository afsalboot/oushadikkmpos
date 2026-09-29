import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { User } from "@/models";
import LoginPinForm from "@/components/LoginPinForm";
export default async function Page() {
  const session = await requireSession();
  const user = await User.findById(session.sub).select("+pinHash").lean();
  return <div className="space-y-4"><Link className="btn" href="/settings">Back to Settings</Link><LoginPinForm enabled={Boolean(user?.pinHash)} /></div>;
}
