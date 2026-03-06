const onlineUsers = new Map();
const sharedLocations = new Map();

let io = null;

function setIO(ioInstance) {
  io = ioInstance;
}

function getIO() {
  return io;
}

function setSharedLocation(userId, location, note = "") {
  if (!userId || !location) return null;
  const payload = {
    userId: String(userId),
    location,
    note,
    updatedAt: new Date(),
  };
  sharedLocations.set(String(userId), payload);
  return payload;
}

function clearSharedLocation(userId) {
  if (!userId) return false;
  return sharedLocations.delete(String(userId));
}

function getSharedLocation(userId) {
  if (!userId) return null;
  return sharedLocations.get(String(userId)) || null;
}

module.exports = {
  onlineUsers,
  sharedLocations,
  setSharedLocation,
  clearSharedLocation,
  getSharedLocation,
  setIO,
  getIO,
};
