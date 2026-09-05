import { NextResponse } from "next/server";
export function ok(data, status = 200) {
  return NextResponse.json({ data }, { status });
}
export function fail(error, status = 400) {
  return NextResponse.json({ error }, { status });
}
export function apiError(error) {
  if (error instanceof SyntaxError) return fail("Invalid JSON request", 400);
  if (error?.name === "CastError") return fail("Invalid record identifier or value", 400);
  if (error?.name === "ValidationError") return fail("Please check the supplied record values", 422);
  if (error?.message === "UNAUTHORIZED")
    return fail("Authentication required", 401);
  if (error?.message === "FORBIDDEN")
    return fail("You do not have permission to perform this action", 403);
  if (error?.message === "PASSWORD_CHANGE_REQUIRED")
    return fail("You must change your password before continuing", 403);
  if (error?.message === "VALIDATION_ERROR")
    return NextResponse.json(
      {
        error: "Please fix the highlighted settings.",
        details: error.details || {},
      },
      { status: 422 },
    );
  if (error?.code === 11000 && (error?.keyPattern?.barcode || error?.keyValue?.barcode))
    return fail("Barcode already belongs to another product", 409);
  if (error?.code === 11000)
    return fail("A record with that value already exists", 409);
  if (
    Number.isInteger(error?.status) &&
    error.status >= 400 &&
    error.status < 500
  )
    return fail(
      error.message || "Request could not be completed",
      error.status,
    );
  console.error(error);
  return fail(
    process.env.NODE_ENV === "production"
      ? "Something went wrong"
      : error?.message || "Something went wrong",
    500,
  );
}
