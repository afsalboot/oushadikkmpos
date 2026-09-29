export const PASSWORD_POLICY_MESSAGE = "Use at least 8 characters with uppercase, lowercase and a number; maximum 72 UTF-8 bytes.";
export function validPassword(value) {
  return typeof value === "string" && value.length >= 8 && new TextEncoder().encode(value).length <= 72
    && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);
}
export function normalizeUsername(value) {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) ? username : null;
}
