import bcrypt from "bcryptjs";
import { connectDb } from "@/lib/db";
import { createToken, sessionCookie } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import { consumeRateLimit, requestClientKey } from "@/lib/rate-limit";
import { isLoginPin, PIN_ATTEMPT_LIMIT } from "@/lib/login-pin";
import { AuditLog, User } from "@/models";

export async function POST(request) {
  try {
    const attempt = consumeRateLimit(`pin-login:${requestClientKey(request)}`, { limit: 20, windowMs: 15 * 60 * 1000 });
    if (!attempt.allowed) return fail("Too many sign-in attempts. Try again later or use your password.", 429);
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !isLoginPin(body.pin)) return fail("Enter your email and a four-digit PIN.", 400);
    await connectDb();
    // Reserve an attempt atomically across devices and server instances.
    const user = await User.findOneAndUpdate({
      email, active: true, mustChangePassword: { $ne: true }, pinHash: { $type: "string" },
      $or: [{ pinAttempts: { $lt: PIN_ATTEMPT_LIMIT } }, { pinAttempts: { $exists: false } }],
    }, { $inc: { pinAttempts: 1 } }, { returnDocument: "after" }).select("+pinHash +pinAttempts").populate("roleId");
    const invalid = () => fail("PIN sign-in unavailable or incorrect. Sign in with your password to set up or unlock your PIN.", 401);
    if (!user) return invalid();
    if (!await bcrypt.compare(body.pin, user.pinHash)) {
      await AuditLog.create({ actorId: user._id, action: "LOGIN_FAILED", module: "auth", targetType: "User", targetId: user._id, description: "Failed PIN login attempt" });
      return invalid();
    }
    // A concurrent reset or deactivation must prevent this login.
    const current = await User.findOneAndUpdate({
      _id: user._id, active: true, mustChangePassword: { $ne: true }, pinHash: user.pinHash,
      authVersion: Number(user.authVersion || 0) === 0 ? { $in: [0, null] } : user.authVersion,
    }, { $set: { pinAttempts: 0, lastLoginAt: new Date(), lastActiveAt: new Date() } }, { returnDocument: "after" }).populate("roleId");
    if (!current) return invalid();
    await AuditLog.create({ actorId: current._id, action: "LOGIN_SUCCESS", module: "auth", targetType: "User", targetId: current._id, description: "Signed in using PIN" });
    const response = ok({ user: { name: current.name, email: current.email, role: current.role, mustChangePassword: false } });
    response.cookies.set(sessionCookie(await createToken(current)));
    return response;
  } catch (error) { return apiError(error); }
}
