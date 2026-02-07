function normalizeLocationInput(value) {
  if (!value) return { country: "", province: "" };
  if (typeof value === "string") {
    return { country: "", province: String(value).trim() };
  }
  return {
    country: String(value.country || "").trim(),
    province: String(value.province || "").trim(),
  };
}

function hasFullLocation(value) {
  const normalized = normalizeLocationInput(value);
  return !!(normalized.country && normalized.province);
}

module.exports = {
  normalizeLocationInput,
  hasFullLocation,
};
