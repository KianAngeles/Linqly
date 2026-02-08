const mongoose = require("mongoose");

const notificationStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    readNotificationIds: {
      type: [String],
      default: [],
    },
    hiddenNotificationIds: {
      type: [String],
      default: [],
    },
    markAllReadAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("NotificationState", notificationStateSchema);
