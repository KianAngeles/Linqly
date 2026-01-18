const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../utils/jwt");
const { authRequired } = require("../middleware/authRequired");
const { validatePassword } = require("../utils/passwordRules");
const { sendPasswordResetEmail } = require("../utils/mailer");
const { resolveAvatar } = require("../utils/avatar");

const rateLimit = require("express-rate-limit"); 
const router = express.Router();

const REFRESH_COOKIE_NAME = "refreshToken";

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: false, // set true in production (https)
    sameSite: "lax",
    path: "/auth/refresh",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/auth/refresh" });
}

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per IP
  message: { message: "Too many requests. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});


// POST /auth/register
router.post("/register", async (req, res) => {
  const { username, email, password, gender } = req.body;

  if (!username || !email || !password)
    return res
      .status(400)
      .json({ message: "username, email, password required" });

  if (!validatePassword(password)) {
    return res.status(400).json({
      message:
        "Password must be 8+ chars with 1 uppercase, 1 lowercase, and 1 special character.",
    });
  }

  const exists = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { username }],
  });
  if (exists) return res.status(409).json({ message: "User already exists" });

  const passwordHash = await bcrypt.hash(password, 12);
  const avatarChoice =
    gender === "female" ? "girl" : gender === "male" ? "man" : null;
  const user = await User.create({
    username,
    email,
    passwordHash,
    avatarChoice,
  });

  const accessToken = signAccessToken({ userId: user._id.toString() });
  const refreshToken = signRefreshToken({ userId: user._id.toString() });

  user.refreshTokenHash = await bcrypt.hash(refreshToken, 12);
  await user.save();

  setRefreshCookie(res, refreshToken);
  return res.status(201).json({
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      avatarUrl: resolveAvatar(user),
      avatarChoice: user.avatarChoice || null,
    },
    accessToken,
  });
});

// POST /auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "email and password required" });

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const accessToken = signAccessToken({ userId: user._id.toString() });
  const refreshToken = signRefreshToken({ userId: user._id.toString() });

  user.refreshTokenHash = await bcrypt.hash(refreshToken, 12);
  await user.save();

  setRefreshCookie(res, refreshToken);
  return res.json({
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      avatarUrl: resolveAvatar(user),
      avatarChoice: user.avatarChoice || null,
    },
    accessToken,
  });
});

// POST /auth/refresh
router.post("/refresh", async (req, res) => {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  if (!token) return res.status(401).json({ message: "Missing refresh token" });

  try {
    const payload = verifyRefreshToken(token);
    const user = await User.findById(payload.userId);
    if (!user || !user.refreshTokenHash)
      return res.status(401).json({ message: "Unauthorized" });

    const matches = await bcrypt.compare(token, user.refreshTokenHash);
    if (!matches) return res.status(401).json({ message: "Unauthorized" });

    const newAccess = signAccessToken({ userId: user._id.toString() });
    return res.json({ accessToken: newAccess });
  } catch {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
});

// POST /auth/logout
router.post("/logout", async (req, res) => {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await User.findByIdAndUpdate(payload.userId, { refreshTokenHash: null });
    } catch {}
  }
  clearRefreshCookie(res);
  return res.json({ ok: true });
});

// GET /auth/me (requires access token)
router.get("/me", authRequired, async (req, res) => {
  const user = await User.findById(req.user.userId).select(
    "_id username email avatarUrl avatarChoice"
  );
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.json({
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      avatarUrl: resolveAvatar(user),
      avatarChoice: user.avatarChoice || null,
    },
  });
});

const crypto = require("crypto");
const { generateResetToken } = require("../utils/resetToken");

// POST /auth/forgot-password
router.post("/forgot-password", forgotLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "email required" });

  // Always return success to avoid user enumeration attacks
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.json({ ok: true });

  const { token, tokenHash } = generateResetToken();

  user.resetPasswordTokenHash = tokenHash;
  user.resetPasswordExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  await user.save();

  const resetLink = `${
    process.env.CLIENT_ORIGIN
  }/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

  // DEV MODE: log the link
  try {
    await sendPasswordResetEmail({
      to: user.email,
      resetLink,
    });
  } catch (err) {
    // Don't leak whether email exists or sending failed
    console.error("❌ Failed to send password reset email:", err.message);
  }

  return res.json({ ok: true });
});

// POST /auth/reset-password
router.post("/reset-password", async (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) {
    return res
      .status(400)
      .json({ message: "email, token, newPassword required" });
  }

  if (!validatePassword(newPassword)) {
    return res.status(400).json({
      message:
        "Password must be 8+ chars with 1 uppercase, 1 lowercase, and 1 special character.",
    });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.resetPasswordTokenHash || !user.resetPasswordExpiresAt) {
    return res.status(400).json({ message: "Invalid or expired reset token" });
  }

  if (user.resetPasswordExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ message: "Invalid or expired reset token" });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  if (tokenHash !== user.resetPasswordTokenHash) {
    return res.status(400).json({ message: "Invalid or expired reset token" });
  }

  // Update password
  user.passwordHash = await bcrypt.hash(newPassword, 12);

  // Clear reset token
  user.resetPasswordTokenHash = null;
  user.resetPasswordExpiresAt = null;

  // Invalidate refresh token too (forces re-login everywhere)
  user.refreshTokenHash = null;

  await user.save();

  // Clear refresh cookie for safety
  clearRefreshCookie(res);

  return res.json({ ok: true });

});



module.exports = router;
