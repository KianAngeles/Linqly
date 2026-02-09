export function validateDisplayName(value) {
  const raw = String(value || "");
  const trimmed = raw.trim();
  if (!trimmed) return "Display name is required";
  if (!/^[A-Za-z ]+$/.test(trimmed)) {
    return "Only letters and spaces are allowed";
  }
  return null;
}

