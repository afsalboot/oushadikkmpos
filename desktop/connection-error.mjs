// Only expose the network code, never a raw error containing URLs or credentials.
export function connectionErrorCode(error) {
  if (typeof error?.code === "string" && /^ERR_[A-Z0-9_]{1,80}$/.test(error.code)) {
    return error.code;
  }
  return typeof error?.message === "string"
    ? error.message.match(/\b(ERR_[A-Z0-9_]{1,80})\b/)?.[1] || "UNKNOWN"
    : "UNKNOWN";
}
