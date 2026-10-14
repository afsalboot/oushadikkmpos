// React state cannot synchronously reject a second event in the same turn.
export function acquireCheckoutSubmit(ref) {
  if (ref.current) return null;
  ref.current = true;
  let active = true;
  return () => { if (active) { active = false; ref.current = false; } };
}
