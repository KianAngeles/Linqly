const DEFAULT_MAN = "/static/avatars/man.png";
const DEFAULT_GIRL = "/static/avatars/girl.png";

function resolveAvatar(user) {
  if (user?.avatarUrl) return user.avatarUrl;
  if (user?.avatarChoice === "girl") return DEFAULT_GIRL;
  return DEFAULT_MAN;
}

module.exports = { DEFAULT_MAN, DEFAULT_GIRL, resolveAvatar };
