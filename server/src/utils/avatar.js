function resolveAvatar(user) {
  return user?.avatarUrl || "";
}

module.exports = { resolveAvatar };
