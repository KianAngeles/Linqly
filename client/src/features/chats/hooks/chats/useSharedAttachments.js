import { useCallback, useMemo, useState } from "react";
import { messagesApi } from "../../api/messages.api";

export default function useSharedAttachments({
  accessToken,
  selectedChatId,
  setShowFindMessage,
}) {
  const [attachmentsData, setAttachmentsData] = useState({
    media: { items: [], loaded: false, loading: false, error: "" },
    files: { items: [], loaded: false, loading: false, error: "" },
    links: { items: [], loaded: false, loading: false, error: "" },
  });
  const [showSharedPanel, setShowSharedPanel] = useState("");
  const [mediaPanels, setMediaPanels] = useState({
    media: false,
    files: false,
    links: false,
  });

  const formatMonthLabel = useCallback((date) => {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "Unknown";
    const month = d.toLocaleString(undefined, { month: "long" });
    const year = d.getFullYear();
    return `${month} ${year}`;
  }, []);

  const groupByMonth = useCallback(
    (items, getDate) => {
      const groups = new Map();
      items.forEach((item) => {
        const key = formatMonthLabel(getDate(item));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      });
      return Array.from(groups.entries()).map(([label, groupItems]) => ({
        label,
        items: groupItems,
      }));
    },
    [formatMonthLabel]
  );

  const loadAttachments = useCallback(
    async (kind, limit = 12) => {
      if (!selectedChatId || !accessToken) return;
      setAttachmentsData((prev) => ({
        ...prev,
        [kind]: { ...prev[kind], loading: true, error: "" },
      }));
      try {
        const data = await messagesApi.listAttachments(
          accessToken,
          selectedChatId,
          kind,
          limit
        );
        setAttachmentsData((prev) => ({
          ...prev,
          [kind]: {
            items: data.items || [],
            loaded: true,
            loading: false,
            error: "",
          },
        }));
      } catch (e) {
        setAttachmentsData((prev) => ({
          ...prev,
          [kind]: {
            ...prev[kind],
            loading: false,
            error: e.message || "Failed to load",
          },
        }));
      }
    },
    [accessToken, selectedChatId]
  );

  const toggleMediaPanel = useCallback(
    (kind) => {
      setMediaPanels((prev) => {
        const next = { ...prev, [kind]: !prev[kind] };
        return next;
      });
      const entry = attachmentsData[kind];
      if (entry && !entry.loaded && !entry.loading) {
        loadAttachments(kind);
      }
    },
    [attachmentsData, loadAttachments]
  );

  const openSharedPanel = useCallback(
    (kind) => {
      if (!selectedChatId || !accessToken) return;
      setShowSharedPanel(kind);
      setShowFindMessage(false);
      loadAttachments(kind, 50);
    },
    [accessToken, loadAttachments, selectedChatId, setShowFindMessage]
  );

  const sharedMediaGroups = useMemo(() => {
    const sorted = [...(attachmentsData.media.items || [])].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    return groupByMonth(sorted, (item) => item.createdAt);
  }, [attachmentsData.media.items, groupByMonth]);

  const sharedFileGroups = useMemo(() => {
    const sorted = [...(attachmentsData.files.items || [])].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    return groupByMonth(sorted, (item) => item.createdAt);
  }, [attachmentsData.files.items, groupByMonth]);

  const sharedLinkGroups = useMemo(() => {
    const sorted = [...(attachmentsData.links.items || [])].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    return groupByMonth(sorted, (item) => item.createdAt);
  }, [attachmentsData.links.items, groupByMonth]);

  return {
    attachmentsData,
    setAttachmentsData,
    showSharedPanel,
    setShowSharedPanel,
    mediaPanels,
    setMediaPanels,
    loadAttachments,
    toggleMediaPanel,
    openSharedPanel,
    sharedMediaGroups,
    sharedFileGroups,
    sharedLinkGroups,
  };
}
