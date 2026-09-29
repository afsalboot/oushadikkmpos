import { connectDb } from "@/lib/db";
import { apiError, ok } from "@/lib/api";
import { createToken, sessionCookie } from "@/lib/auth";
import { requestClientKey } from "@/lib/rate-limit";
import { authenticateUsername } from "@/services/username-auth.service";

export async function POST(request) {
  try {
    const body = await request.json();
    await connectDb();
    const user = await authenticateUsername(body, requestClientKey(request));
    const response = ok({ user: { name: user.name, username: user.username, mustChangePassword: user.mustChangePassword } });
    response.cookies.set(sessionCookie(await createToken(user)));
    return response;
  } catch (error) { return apiError(error); }
}
