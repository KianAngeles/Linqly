const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    usernameLower: {
      type: String,
      required: true,
      unique: true,
      index: true,
      sparse: true,
    },
    displayName: {
      type: String,
      trim: true,
      default: "",
    },
    bio: {
      type: String,
      trim: true,
      default: "",
      maxlength: 180,
    },
    location: {
      country: { type: String, trim: true, default: "" },
      province: { type: String, trim: true, default: "" },
    },
    birthday: {
      type: Date,
      default: null,
    },
    interests: {
      type: [String],
      default: [],
    },
    about: {
      type: String,
      trim: true,
      default: "",
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
    gender: {
      type: String,
      enum: ["male", "female", "other", ""],
      default: "",
    },

    status: {
      type: String,
      enum: ["online", "offline", "busy"],
      default: "offline",
    },

    privacy: {
      gender: {
        type: String,
        enum: ["Public", "Friends", "Only me"],
        default: "Public",
      },
      birthday: {
        type: String,
        enum: ["Public", "Friends", "Only me"],
        default: "Friends",
      },
      location: {
        type: String,
        enum: ["Public", "Friends", "Only me"],
        default: "Friends",
      },
      interests: {
        type: String,
        enum: ["Public", "Friends", "Only me"],
        default: "Public",
      },
      bio: {
        type: String,
        enum: ["Public", "Friends", "Only me"],
        default: "Public",
      },
      about: {
        type: String,
        enum: ["Public", "Friends", "Only me"],
        default: "Public",
      },
      friends: {
        type: String,
        enum: ["Public", "Friends", "Only me"],
        default: "Friends",
      },
      hangoutsCreated: {
        type: String,
        enum: ["Public", "Friends", "Only me"],
        default: "Friends",
      },
      hangoutsJoined: {
        type: String,
        enum: ["Public", "Friends", "Only me"],
        default: "Only me",
      },
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

module.exports = mongoose.model("User", userSchema);
