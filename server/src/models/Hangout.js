const mongoose = require("mongoose");

const hangoutSchema = new mongoose.Schema(
  {
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 280, default: "" },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true },
    },
    startsAt: { type: Date, default: () => new Date() },
    endsAt: { type: Date, default: () => new Date(Date.now() + 2 * 60 * 60 * 1000) },
    visibility: {
      type: String,
      enum: ["friends", "public"],
      default: "friends",
    },
    joinPolicy: {
      type: String,
      enum: ["open", "approval"],
      default: "open",
    },
    avatarUrl: { type: String, default: null },
    avatarPublicId: { type: String, default: null },
    maxAttendees: {
      type: Number,
      min: 1,
      default: null,
    },
    sharedLocations: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        location: {
          type: { type: String, enum: ["Point"], default: "Point" },
          coordinates: { type: [Number], required: true },
        },
        updatedAt: { type: Date, default: () => new Date() },
        note: { type: String, default: "" },
      },
    ],
    attendeeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    pendingJoinRequests: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        requestedAt: { type: Date, default: () => new Date() },
      },
    ],
    approvedJoinEvents: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        approvedById: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        approvedAt: { type: Date, default: () => new Date() },
      },
    ],
  },
  { timestamps: true }
);

hangoutSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Hangout", hangoutSchema);
