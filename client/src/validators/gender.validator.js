export function validateGender(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Please select your gender";
  if (raw !== "Male" && raw !== "Female") return "Please select your gender";
  return null;
}

