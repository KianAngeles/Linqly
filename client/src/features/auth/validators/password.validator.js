export function validatePassword(value) {
  const raw = String(value || "");
  if (!raw) return "Password is required";
  if (raw.length < 8) return "Password must be at least 8 characters";
  if (/\s/.test(raw)) return "Password must not contain spaces";
  if (!/[0-9]/.test(raw)) return "Password must include a number";
  if (!/[A-Za-z]/.test(raw)) return "Password must include a letter";
  return null;
}

