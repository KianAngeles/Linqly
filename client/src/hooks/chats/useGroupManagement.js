import { useCallback, useEffect, useState } from "react";
import { chatsApi } from "../../api/chats.api";

export default function useGroupManagement({
  accessToken,
  selectedChatId,
  selectedChatType,
  friends,
  isHangoutChat,
  setErr,
  loadChats,
  setShowAddMembers,
  setSelectedChatId,
}) {
  const [groupSettings, setGroupSettings] = useState(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupAvatarUploading, setGroupAvatarUploading] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    if (!['group', 'hangout'].includes(selectedChatType)) {
      setGroupSettings(null);
      return;
    }

    chatsApi
      .getGroupSettings(accessToken, selectedChatId)
      .then((data) => {
        setGroupSettings(data.chat);
        setGroupNameDraft(data.chat?.name || "");
      })
      .catch(() => {});
  }, [accessToken, selectedChatId, selectedChatType]);

  const addMemberToGroup = useCallback(
    async (userId) => {
      setErr("");
      try {
        const ids = Array.isArray(userId) ? userId : [userId];
        for (const id of ids) {
          const data = await chatsApi.addMember(
            accessToken,
            selectedChatId,
            id
          );
          if (!data?.pending) {
            const addedFriend = friends.find(
              (f) => String(f.user?.id) === String(id)
            );
            if (addedFriend?.user) {
              setGroupSettings((prev) => {
                if (!prev) return prev;
                const exists = (prev.members || []).some(
                  (m) => String(m.id) === String(id)
                );
                if (exists) return prev;
                return {
                  ...prev,
                  members: [
                    ...(prev.members || []),
                    {
                      id,
                      username: addedFriend.user.username || "Unknown",
                      avatarUrl: addedFriend.user.avatarUrl || "",
                    },
                  ],
                };
              });
            }
          }
        }
        await loadChats();
        setShowAddMembers(false);
      } catch (e) {
        setErr(e.message);
      }
    },
    [
      accessToken,
      friends,
      loadChats,
      selectedChatId,
      setErr,
      setShowAddMembers,
    ]
  );

  const saveGroupName = useCallback(
    async () => {
      setErr("");
      try {
        await chatsApi.updateGroup(accessToken, selectedChatId, {
          name: groupNameDraft,
        });
        setGroupSettings((prev) =>
          prev ? { ...prev, name: groupNameDraft } : prev
        );
        await loadChats();
      } catch (e) {
        setErr(e.message);
      }
    },
    [accessToken, groupNameDraft, loadChats, selectedChatId, setErr]
  );

  const uploadGroupAvatar = useCallback(
    async (file) => {
      if (!file) return;
      setErr("");
      setGroupAvatarUploading(true);
      try {
        await chatsApi.uploadGroupAvatar(accessToken, selectedChatId, file);
        await loadChats();
      } catch (e) {
        setErr(e.message);
      } finally {
        setGroupAvatarUploading(false);
      }
    },
    [accessToken, loadChats, selectedChatId, setErr]
  );

  const removeMember = useCallback(
    async (userId) => {
      setErr("");
      try {
        await chatsApi.removeMember(accessToken, selectedChatId, userId);
        setGroupSettings((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            members: (prev.members || []).filter(
              (m) => String(m.id) !== String(userId)
            ),
            admins: (prev.admins || []).filter(
              (m) => String(m.id) !== String(userId)
            ),
          };
        });
        await loadChats();
      } catch (e) {
        setErr(e.message);
      }
    },
    [accessToken, loadChats, selectedChatId, setErr]
  );

  const makeAdmin = useCallback(
    async (userId) => {
      setErr("");
      try {
        await chatsApi.makeAdmin(accessToken, selectedChatId, userId);
        setGroupSettings((prev) => {
          if (!prev) return prev;
          const admins = prev.admins || [];
          const alreadyAdmin = admins.some((a) => String(a.id) === String(userId));
          if (alreadyAdmin) return prev;
          const member = (prev.members || []).find(
            (m) => String(m.id) === String(userId)
          );
          return {
            ...prev,
            admins: member
              ? [
                  ...admins,
                  {
                    id: member.id,
                    username: member.username,
                    avatarUrl: member.avatarUrl || "",
                  },
                ]
              : admins,
          };
        });
        await loadChats();
      } catch (e) {
        setErr(e.message);
      }
    },
    [accessToken, loadChats, selectedChatId, setErr]
  );

  const removeAdmin = useCallback(
    async (userId) => {
      setErr("");
      try {
        await chatsApi.removeAdmin(accessToken, selectedChatId, userId);
        setGroupSettings((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            admins: (prev.admins || []).filter(
              (a) => String(a.id) !== String(userId)
            ),
          };
        });
        await loadChats();
      } catch (e) {
        setErr(e.message);
      }
    },
    [accessToken, loadChats, selectedChatId, setErr]
  );

  const approveJoin = useCallback(
    async (userId) => {
      setErr("");
      try {
        await chatsApi.approveJoin(accessToken, selectedChatId, userId);
        setGroupSettings((prev) => {
          if (!prev) return prev;
          const pending = prev.pendingJoinRequests || [];
          const requested = pending.find(
            (r) => String(r.user?.id) === String(userId)
          );
          const members = prev.members || [];
          const alreadyMember = members.some(
            (m) => String(m.id) === String(userId)
          );
          return {
            ...prev,
            members:
              requested && !alreadyMember
                ? [
                    ...members,
                    {
                      id: requested.user.id,
                      username: requested.user.username,
                      avatarUrl: requested.user.avatarUrl || "",
                    },
                  ]
                : members,
            pendingJoinRequests: pending.filter(
              (r) => String(r.user?.id) !== String(userId)
            ),
          };
        });
        await loadChats();
      } catch (e) {
        setErr(e.message);
      }
    },
    [accessToken, loadChats, selectedChatId, setErr]
  );

  const rejectJoin = useCallback(
    async (userId) => {
      setErr("");
      try {
        await chatsApi.rejectJoin(accessToken, selectedChatId, userId);
        setGroupSettings((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pendingJoinRequests: (prev.pendingJoinRequests || []).filter(
              (r) => String(r.user?.id) !== String(userId)
            ),
          };
        });
      } catch (e) {
        setErr(e.message);
      }
    },
    [accessToken, selectedChatId, setErr]
  );

  const handleLeaveGroup = useCallback(
    async () => {
      const label = isHangoutChat
        ? "Leave this hangout chat?"
        : "Leave this group chat?";
      if (!confirm(label)) return;
      setErr("");
      try {
        await chatsApi.leaveGroup(accessToken, selectedChatId);
        await loadChats();
        setSelectedChatId("");
        return true;
      } catch (e) {
        setErr(e.message);
      }
      return false;
    },
    [
      accessToken,
      isHangoutChat,
      loadChats,
      selectedChatId,
      setErr,
      setSelectedChatId,
    ]
  );

  return {
    groupSettings,
    setGroupSettings,
    groupNameDraft,
    setGroupNameDraft,
    groupAvatarUploading,
    addMemberToGroup,
    saveGroupName,
    uploadGroupAvatar,
    removeMember,
    makeAdmin,
    removeAdmin,
    approveJoin,
    rejectJoin,
    handleLeaveGroup,
  };
}
