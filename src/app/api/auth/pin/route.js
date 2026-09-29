import bcrypt from "bcryptjs";
import { requireSession, createToken, sessionCookie } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import { consumeAuthAttempt } from "@/lib/server/auth-attempts";
import { isLoginPin } from "@/lib/login-pin";
import { AuditLog, User } from "@/models";

export async function POST(request) {
  try {
    const session = await requireSession();
    if (!(await consumeAuthAttempt(`pin-setup:${session.sub}`)).allowed) return fail("Too many attempts. Try again in 15 minutes.", 429);
    const body = await request.json();
    const remove = body?.remove === true;
    if (!remove && (!isLoginPin(body?.pin) || body.pin !== body.confirmPin)) return fail("Enter matching four-digit PINs.", 400);
    const user = await User.findById(session.sub);
    if (!user?.username) return fail("Set up your username before enabling PIN login.", 400);
    if (!await bcrypt.compare(String(body.currentPassword || ""), user.passwordHash)) return fail("Current password is incorrect.", 400);
    const update = { $set: { pinAttempts: 0 }, $inc: { authVersion: 1 } };
    if (remove) update.$unset = { pinHash: 1 };
    else update.$set.pinHash = await bcrypt.hash(body.pin, 12);
    const updated = await User.findOneAndUpdate({ _id: user._id, username: user.username, passwordHash: user.passwordHash, active: true, mustChangePassword: { $ne: true }, authVersion: Number(user.authVersion || 0) === 0 ? { $in: [0, null] } : user.authVersion }, update, { returnDocument: "after" });
    if (!updated) return fail("Account changed. Sign in again and retry.", 409);
    await AuditLog.create({ actorId: user._id, action: remove ? "PIN_REMOVED" : "PIN_CHANGED", module: "auth", targetType: "User", targetId: user._id, description: remove ? "Login PIN removed" : "Login PIN configured" });
    const response = ok({ success: true });
    response.cookies.set(sessionCookie(await createToken(updated)));
    return response;
  } catch (error) { return apiError(error); }
}
