import { useEffect, useId, useRef } from "react";

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
}

export default function MapOverlayDrawer({
  id,
  side = "left",
  open,
  title,
  onClose,
  drawerRef = null,
  children,
}) {
  const localRef = useRef(null);
  const titleId = useId();
  const isOpen = Boolean(open);

  useEffect(() => {
    if (!isOpen) return undefined;
    const node = localRef.current;
    if (!node) return undefined;
    const previousFocus = document.activeElement;
    const focusables = getFocusableElements(node);
    (focusables[0] || node).focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== "Tab") return;
      const current = getFocusableElements(node);
      if (current.length === 0) {
        event.preventDefault();
        return;
      }
      const first = current[0];
      const last = current[current.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
    };
  }, [isOpen, onClose]);

  const setRefs = (node) => {
    localRef.current = node;
    if (!drawerRef) return;
    if (typeof drawerRef === "function") {
      drawerRef(node);
    } else {
      drawerRef.current = node;
    }
  };

  return (
    <>
      <div
        className={`map-drawer-backdrop ${isOpen ? "is-open" : ""}`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />
      <aside
        id={id}
        ref={setRefs}
        className={`map-drawer map-drawer--${side} ${isOpen ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!isOpen}
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="map-drawer-header">
          <div className="fw-semibold" id={titleId}>
            {title}
          </div>
          <button
            type="button"
            className="map-drawer-close"
            aria-label="Close drawer"
            onClick={onClose}
          >
            x
          </button>
        </div>
        <div className="map-drawer-body">{children}</div>
      </aside>
    </>
  );
}
