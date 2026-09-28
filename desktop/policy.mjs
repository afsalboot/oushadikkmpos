export const PRODUCTION_URL = "https://oushadikkmpos.vercel.app";

export function getStartUrl(packaged, args) {
  return !packaged && args.includes("--local") ? "http://localhost:3000" : PRODUCTION_URL;
}

export function isTrustedUrl(value, startUrl) {
  try {
    const url = new URL(value);
    return url.origin === new URL(startUrl).origin && !url.username && !url.password;
  } catch {
    return false;
  }
}
