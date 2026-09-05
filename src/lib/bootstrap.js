import { createHash, timingSafeEqual } from "node:crypto";

export function bootstrapAllowed(token, env = process.env) {
  const expected = env.BOOTSTRAP_TOKEN;
  if (!expected) return env.NODE_ENV !== "production";
  if (typeof token !== "string" || token.length > 512) return false;
  const digest = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(token), digest(expected));
}
