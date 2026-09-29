import bcrypt from "bcryptjs";
import { connectDb } from "@/lib/db";
import { createToken, sessionCookie } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import { requestClientKey } from "@/lib/rate-limit";
import { consumeAuthAttempt } from "@/lib/server/auth-attempts";
import { normalizeUsername } from "@/lib/password-policy";
import { isLoginPin, PIN_ATTEMPT_LIMIT } from "@/lib/login-pin";
import { AuditLog, User } from "@/models";

export async function POST(request) {
  try {
    const body = await request.json();
    const username = normalizeUsername(body?.username);
    if (!username || !isLoginPin(body?.pin)) return fail("Enter your username and four-digit PIN.", 400);
    await connectDb();
    if (!(await consumeAuthAttempt(`pin-ip:${requestClientKey(request)}`, 20)).allowed) return fail("Too many PIN attempts. Try again later or use your password.", 429);
    // Reserve each attempt atomically; password sign-in unlocks the account.
    const user = await User.findOneAndUpdate({
      username, active: true, mustChangePassword: { $ne: true }, pinHash: { $type: "string" },
      $or: [{ pinAttempts: { $lt: PIN_ATTEMPT_LIMIT } }, { pinAttempts: { $exists: false } }],
    }, { $inc: { pinAttempts: 1 } }, { returnDocument: "after" }).select("+pinHash +pinAttempts");
    const invalid = () => fail("Invalid credentials or PIN unavailable. Use your password to sign in and set up or unlock your PIN.", 401);
    if (!user) return invalid();
    if (!await bcrypt.compare(body.pin, user.pinHash)) {
      await AuditLog.create({ actorId: user._id, action: "LOGIN_FAILED", module: "auth", targetType: "User", targetId: user._id, description: "Failed username and PIN login" });
      return invalid();
    }
    const current = await User.findOneAndUpdate({
      _id: user._id, username, active: true, mustChangePassword: { $ne: true }, pinHash: user.pinHash,
      authVersion: Number(user.authVersion || 0) === 0 ? { $in: [0, null] } : user.authVersion,
    }, { $set: { pinAttempts: 0, lastLoginAt: new Date(), lastActiveAt: new Date() } }, { returnDocument: "after" }).populate("roleId");
    if (!current) return invalid();
    await AuditLog.create({ actorId: current._id, action: "LOGIN_SUCCESS", module: "auth", targetType: "User", targetId: current._id, description: "Signed in with username and PIN" });
    const response = ok({ user: { name: current.name, username: current.username, mustChangePassword: false } });
    response.cookies.set(sessionCookie(await createToken(current)));
    return response;
  } catch (error) { return apiError(error); }
}
