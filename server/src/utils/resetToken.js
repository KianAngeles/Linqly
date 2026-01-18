const crypto = require("crypto");

function generateResetToken() {
  const token = crypto.randomBytes(32).toString("hex"); // user receives this
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex"); // store this
  return { token, tokenHash };
}

module.exports = { generateResetToken };
