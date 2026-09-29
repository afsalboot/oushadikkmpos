import { fail } from "@/lib/api";
export async function GET() { return fail("Public user listing is disabled.", 410); }
