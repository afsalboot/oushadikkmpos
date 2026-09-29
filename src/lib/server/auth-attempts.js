import { createHash } from "node:crypto";
import { AuthAttempt } from "@/models";

export function authAttemptUpdate(now, windowMs) {
  const expired = { $lte: [{ $ifNull: ["$expiresAt", new Date(0)] }, now] };
  return [{ $set: {
    count: { $cond: [expired, 1, { $add: [{ $ifNull: ["$count", 0] }, 1] }] },
    expiresAt: { $cond: [expired, new Date(now.getTime() + windowMs), "$expiresAt"] },
  } }];
}
export async function consumeAuthAttempt(key, limit = 5, windowMs = 15 * 60 * 1000) {
  const now = new Date();
  const id = createHash("sha256").update(key).digest("hex");
  const update = authAttemptUpdate(now, windowMs);
  let row;
  try {
    row = await AuthAttempt.findOneAndUpdate({ _id: id }, update, { upsert: true, returnDocument: "after", updatePipeline: true }).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    row = await AuthAttempt.findOneAndUpdate({ _id: id }, update, { returnDocument: "after", updatePipeline: true }).lean();
  }
  if (!row) throw new Error("Authentication throttle unavailable");
  return { allowed: row.count <= limit, retryAfter: Math.max(1, Math.ceil((new Date(row.expiresAt) - now) / 1000)) };
}
