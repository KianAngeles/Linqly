export function getUserId(userLike) {
  return userLike?.id || userLike?._id || userLike?.userId || null;
}

export function getUserName(userLike) {
  return (
    userLike?.username ||
    userLike?.name ||
    userLike?.displayName ||
    "Unknown"
  );
}

export function getDisplayName(userLike, nicknamesMap) {
  const id = getUserId(userLike);
  if (id && nicknamesMap && nicknamesMap[String(id)]) {
    return nicknamesMap[String(id)];
  }
  return getUserName(userLike);
}

export function getDirectPeer(chat, currentUserId) {
  const members =
    chat?.members ||
    chat?.participants ||
    chat?.users ||
    chat?.memberships ||
    [];
  return members.find(
    (member) => String(getUserId(member)) !== String(currentUserId)
  );
}
