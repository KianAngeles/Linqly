import downIcon from "../assets/icons/down.png";

export default function AccordionSection({
  title,
  icon,
  isOpen,
  onToggle,
  children,
}) {
  return (
    <div className={`chat-accordion-section ${isOpen ? "is-open" : ""}`}>
      <button
        type="button"
        className="chat-accordion-header"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="chat-accordion-title">
          {icon && <img src={icon} alt="" className="chat-accordion-icon" />}
          {title}
        </span>
        <img
          src={downIcon}
          alt=""
          className={`chat-accordion-chevron ${isOpen ? "is-open" : ""}`}
        />
      </button>
      {isOpen && <div className="chat-accordion-body">{children}</div>}
    </div>
  );
}
