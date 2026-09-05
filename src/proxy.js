import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const AUTH_COOKIE = "oushadi_session";
const unsafeRegex = /[.*+?^${}()|[\]\\]/;

export async function proxy(request) {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const fetchSite = request.headers.get("sec-fetch-site");
    const origin = request.headers.get("origin");
    if (fetchSite === "cross-site" || (origin && origin !== request.nextUrl.origin)) return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }
  if (request.nextUrl.pathname !== "/api/search") return NextResponse.next();
  const query = request.nextUrl.searchParams.get("q") || "";
  if (query.length > 100 || unsafeRegex.test(query)) return NextResponse.json({ error: "Invalid search query" }, { status: 400 });
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token || !process.env.JWT_SECRET) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], issuer: "oushadi-pos", audience: "oushadi-workspace" });
    if (payload.role !== "ADMIN") return NextResponse.json({ error: "You do not have permission to perform this action" }, { status: 403 });
    return NextResponse.next();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
}

export const config = { matcher: ["/api/:path*"] };
