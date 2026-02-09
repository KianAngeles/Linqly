export function validateUsername(value) {
  const raw = String(value || "");
  if (!raw.trim()) return "Username is required";
  if (/\s/.test(raw)) return "No spaces allowed";
  if (!/^[a-z0-9_]+$/.test(raw)) {
    return "Only letters, numbers, and underscores allowed";
  }
  if (raw.length < 3 || raw.length > 30) {
    return "Username must be 3-30 characters";
  }
  return null;
}

