import bcrypt from "bcryptjs";
import { User, AuditLog } from "@/models";
import { consumeAuthAttempt } from "@/lib/server/auth-attempts";
import { normalizeUsername, validPassword, PASSWORD_POLICY_MESSAGE } from "@/lib/password-policy";

const dummyHash = bcrypt.hash("invalid-login-placeholder-not-a-password", 12);
const reject = (message, status = 401) => { throw Object.assign(new Error(message), { status }); };
const invalid = () => reject("Invalid credentials or account unavailable.");

export async function authenticateUsername(body, client) {
  const ip = await consumeAuthAttempt(`username-ip:${client}`, 30);
  if (!ip.allowed) reject("Too many sign-in attempts. Try again in 15 minutes.", 429);
  const username = normalizeUsername(body?.username);
  const setup = body?.setupUsername === true;
  if (!username || typeof body?.password !== "string" || body.password.length > 1024) return invalid();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (setup && (!email || email.length > 254)) return invalid();
  const user = await User.findOne(setup ? { email } : { username });
  const attempt = await consumeAuthAttempt(`username-account:${user ? String(user._id) : setup ? email : username}`);
  if (!attempt.allowed) reject("Too many sign-in attempts. Try again in 15 minutes.", 429);
  const matched = await bcrypt.compare(body.password, user?.passwordHash || await dummyHash);
  if (!matched || !user?.active || (setup && user.username)) {
    if (user) await AuditLog.create({ actorId: user._id, action: "LOGIN_FAILED", module: "auth", targetType: "User", targetId: user._id, description: "Failed username sign-in or setup" });
    return invalid();
  }
  const filter = { _id: user._id, active: true, passwordHash: user.passwordHash,
    authVersion: Number(user.authVersion || 0) === 0 ? { $in: [0, null] } : user.authVersion };
  const update = { $set: { lastLoginAt: new Date(), lastActiveAt: new Date() } };
  if (setup) {
    if (!validPassword(body.newPassword)) reject(PASSWORD_POLICY_MESSAGE, 400);
    if (body.newPassword !== body.confirmPassword) reject("New passwords do not match.", 400);
    await User.init();
    filter.username = { $exists: false };
    update.$set.username = username;
    update.$set.passwordHash = await bcrypt.hash(body.newPassword, 12);
    update.$set.mustChangePassword = false;
    update.$inc = { authVersion: 1 };
    update.$unset = { pinHash: 1, pinAttempts: 1 };
  } else {
    filter.username = username;
    update.$set.pinAttempts = 0;
    if (!validPassword(body.password)) update.$set.mustChangePassword = true;
  }
  const current = await User.findOneAndUpdate(filter, update, { returnDocument: "after" }).populate("roleId");
  if (!current) return invalid();
  await AuditLog.create({ actorId: current._id, action: setup ? "USERNAME_SETUP" : "LOGIN_SUCCESS", module: "auth", targetType: "User", targetId: current._id, description: setup ? "Configured username and password" : "Signed in with username and password" });
  return current;
}
