export function resolveAttachmentUrl(rawUrl, apiBase) {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  return `${apiBase}${rawUrl}`;
}
