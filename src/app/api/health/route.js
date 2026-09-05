import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Liveness only: no settings initialization, customer data, or database writes.
export function GET() {
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
