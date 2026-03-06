const MODES = [
  { value: "archive", label: "Archive" },
  { value: "requests", label: "Requests" },
];

export default function ChatModeToggle({ mode, onModeChange }) {
  return (
    <div className="chat-sidebar-mode-toggle mb-3" role="group" aria-label="Chat mode switcher">
      {MODES.map((item) => (
        <button
          key={item.value}
          type="button"
          className={`chat-sidebar-mode-btn ${mode === item.value ? "active" : ""}`}
          aria-pressed={mode === item.value}
          onClick={() => onModeChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
