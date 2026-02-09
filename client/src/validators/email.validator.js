const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value) {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed) return "Email is required";
  if (!EMAIL_RE.test(trimmed)) return "Invalid email format";
  return null;
}

