require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");

const app = require("./app");
const { connectDB } = require("./config/db");
const { onlineUsers, setIO } = require("./realtime");

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

setIO(io); // ✅ makes io available everywhere via realtime.js

io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id);

  socket.on("auth:online", (userId) => {
    if (!userId) return;
    onlineUsers.set(String(userId), socket.id);
    console.log("✅ User online:", userId);
  });

  socket.on("chat:join", ({ chatId }) => {
    if (!chatId) return;
    socket.join(String(chatId));
    // console.log(`✅ socket ${socket.id} joined chat ${chatId}`);
  });

  socket.on("disconnect", () => {
    for (const [uid, sid] of onlineUsers.entries()) {
      if (sid === socket.id) {
        onlineUsers.delete(uid);
        console.log("🔴 User offline:", uid);
        break;
      }
    }
    console.log("🔴 Socket disconnected:", socket.id);
  });
});

(async () => {
  try {
    await connectDB(process.env.MONGODB_URI);
    server.listen(PORT, () => console.log(`✅ Server running on ${PORT}`));
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
})();
