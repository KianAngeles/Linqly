const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const path = require("path");

const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const friendsRoutes = require("./routes/friends.routes");
const notificationsRoutes = require("./routes/notifications.routes");
const messageRequestsRoutes = require("./routes/messageRequests.routes");

const chatsRoutes = require("./routes/chats.routes");
const messagesRoutes = require("./routes/messages.routes");
const hangoutsRoutes = require("./routes/hangouts.routes");

const app = express();

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Rate limit (optional but good)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3000,
    skip: (req) => req.method === "OPTIONS",
  })
);

// JSON + cookies (MUST be before routes)
app.use(express.json());
app.use(cookieParser());

// CORS (important for cookies)
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// Health check
app.get("/health", (req, res) => res.json({ ok: true }));

// Static files
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
app.use(
  "/static/avatars",
  express.static(path.join(__dirname, "static", "avatars"))
);

// Routes
app.get("/", (req, res) => res.send("Linqly API is running ✅"));
app.use("/auth", authRoutes);
app.use("/users", usersRoutes);
app.use("/friends", friendsRoutes);
app.use("/notifications", notificationsRoutes);
app.use("/message-requests", messageRequestsRoutes);
app.use("/chats", chatsRoutes);
app.use("/messages", messagesRoutes);
app.use("/hangouts", hangoutsRoutes);



module.exports = app;
