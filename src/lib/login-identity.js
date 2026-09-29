export function loginIdentity(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (body.userId !== undefined) {
    if (typeof body.userId !== "string" || !/^[a-f0-9]{24}$/i.test(body.userId)) return null;
    return { _id: body.userId.toLowerCase() };
  }
  if (typeof body.email !== "string") return null;
  const email = body.email.trim().toLowerCase();
  return email && email.length <= 254 ? { email } : null;
}
