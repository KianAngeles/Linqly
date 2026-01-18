const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      minlength: 3,
      maxlength: 30,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },

    passwordHash: {
      type: String,
      required: true,
    },

    // Auth & security
    refreshTokenHash: {
      type: String,
      default: null,
    },

    resetPasswordTokenHash: {
      type: String,
      default: null,
    },

    resetPasswordExpiresAt: {
      type: Date,
      default: null,
    },

    // (Optional for later UI)
    avatarUrl: {
      type: String,
      default: null,
    },
    avatarPublicId: {
      type: String,
      default: null,
    },
    avatarChoice: {
      type: String,
      enum: ["man", "girl"],
      default: null,
    },

    status: {
      type: String,
      enum: ["online", "offline", "busy"],
      default: "offline",
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

module.exports = mongoose.model("User", userSchema);
