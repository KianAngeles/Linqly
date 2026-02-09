import "./AuthSplitLayout.css";

export default function AuthSplitLayout({
  side = "left",
  title,
  subtitle = "",
  children,
  panelHeading,
  panelText,
  transition = "",
}) {
  const sideClass = side === "right" ? "auth-form-right" : "auth-form-left";
  const transitionClass = transition ? `auth-transition-${transition}` : "";

  return (
    <div className={`auth-split-shell ${sideClass} ${transitionClass}`.trim()}>
      <section className="auth-split-form-col" aria-label="Authentication form">
        <div className="auth-split-form-inner">
          <h1 className="auth-split-title">{title}</h1>
          {subtitle ? <p className="auth-split-subtitle">{subtitle}</p> : null}
          {children}
        </div>
      </section>

      <aside className="auth-split-visual-col" aria-hidden="true">
        <div className="auth-visual-content">
          <div className="auth-visual-heading">{panelHeading}</div>
          <div className="auth-visual-text">{panelText}</div>
        </div>
        <span className="auth-visual-circle auth-visual-circle-lg" />
        <span className="auth-visual-circle auth-visual-circle-md" />
        <span className="auth-visual-circle auth-visual-circle-sm" />
      </aside>
    </div>
  );
}

