import bcrypt from "bcryptjs";
import { readSession, createToken, sessionCookie } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { apiError, fail, ok } from "@/lib/api";
import { AuditLog, User } from "@/models";
import { getSettings } from "@/services/settings.service";

export async function POST(request) {
  try {
    const session = await readSession();
    if (!session) return fail("Authentication required", 401);
    await connectDb();
    const body = await request.json();
    const user = await User.findById(session.sub);
    if (!user) return fail("Authentication required", 401);
    if (!await bcrypt.compare(String(body.currentPassword || ""), user.passwordHash)) return fail("Current password is incorrect", 400);

    const settings = await getSettings();
    const rules = settings.security || {};
    const password = String(body.password || "");
    const invalid = password.length < Number(rules.minimumPasswordLength || 8)
      || (rules.requireUppercase !== false && !/[A-Z]/.test(password))
      || (rules.requireLowercase !== false && !/[a-z]/.test(password))
      || (rules.requireNumber !== false && !/\d/.test(password))
      || (rules.requireSpecialCharacter && !/[^A-Za-z0-9]/.test(password));
    if (invalid) return fail("The new password does not meet the configured password rules", 400);
    if (password !== String(body.confirmPassword || "")) return fail("Passwords do not match", 400);
    if (await bcrypt.compare(password, user.passwordHash)) return fail("Choose a password different from your current password", 400);

    user.passwordHash = await bcrypt.hash(password, 12);
    user.mustChangePassword = false;
    user.authVersion = Number(user.authVersion || 0) + 1;
    user.lastActiveAt = new Date();
    await user.save();
    await AuditLog.create({ actorId: user._id, action: "PASSWORD_CHANGED", module: "auth", targetType: "User", targetId: user._id, description: "Password changed" });
    const response = ok({ success: true });
    response.cookies.set(sessionCookie(await createToken(user)));
    return response;
  } catch (error) {
    return apiError(error);
  }
}
