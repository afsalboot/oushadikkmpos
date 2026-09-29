export const PIN_ATTEMPT_LIMIT = 5;
export function isLoginPin(value) {
  return typeof value === "string" && /^[0-9]{4}$/.test(value);
}
