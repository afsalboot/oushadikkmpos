import { requireSession } from "@/lib/auth";
import { User } from "@/models";
import LoginPinForm from "@/components/LoginPinForm";
export default async function LoginPinPage() {
  const session = await requireSession();
  const user = await User.findById(session.sub).select("+pinHash").lean();
  return <LoginPinForm enabled={Boolean(user?.pinHash)} />;
}
