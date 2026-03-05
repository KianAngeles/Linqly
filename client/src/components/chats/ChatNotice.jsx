const ALLOWED_TONES = new Set(["danger", "warning", "info", "muted"]);

export default function ChatNotice({
  tone = "muted",
  className = "",
  role = undefined,
  children,
}) {
  const noticeTone = ALLOWED_TONES.has(tone) ? tone : "muted";
  const classes = ["chat-notice", `chat-notice--${noticeTone}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role={role}>
      {children}
    </div>
  );
}
