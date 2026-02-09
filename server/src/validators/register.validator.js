const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeRegisterPayload(body = {}) {
  return {
    ...body,
    displayName: String(body.displayName || "").trim(),
    username: String(body.username || "").trim().toLowerCase(),
    email: String(body.email || "").trim().toLowerCase(),
    gender: String(body.gender || "").trim().toLowerCase(),
  };
}

function validateRegisterPayload(body = {}) {
  const data = normalizeRegisterPayload(body);

  if (!data.displayName) return "Display name is required";
  if (!/^[A-Za-z ]+$/.test(data.displayName)) {
    return "Only letters and spaces are allowed";
  }

  if (!data.username) return "Username is required";
  if (/\s/.test(data.username)) return "No spaces allowed";
  if (!/^[a-z0-9_]+$/.test(data.username)) {
    return "Only letters, numbers, and underscores allowed";
  }
  if (data.username.length < 3 || data.username.length > 30) {
    return "Username must be 3-30 characters";
  }

  if (!data.email) return "Email is required";
  if (!EMAIL_RE.test(data.email)) return "Invalid email format";

  const password = String(body.password || "");
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (/\s/.test(password)) return "Password must not contain spaces";
  if (!/[0-9]/.test(password)) return "Password must include a number";
  if (!/[A-Za-z]/.test(password)) return "Password must include a letter";

  if (!data.gender || (data.gender !== "male" && data.gender !== "female")) {
    return "Please select your gender";
  }

  return null;
}

module.exports = {
  normalizeRegisterPayload,
  validateRegisterPayload,
};

