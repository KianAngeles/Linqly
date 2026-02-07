function normalizeUsername(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

function isUsernameValid(value) {
  return /^[a-z0-9_]{3,30}$/.test(value);
}

module.exports = {
  normalizeUsername,
  isUsernameValid,
};
