import "./AuthCardLayout.css";

export default function AuthCardLayout({
  title,
  subtitle = "",
  children,
  footer = null,
}) {
  return (
    <div className="auth-card-page">
      <section className="auth-card-panel" aria-label={title || "Authentication"}>
        <h1 className="auth-card-title">{title}</h1>
        {subtitle ? <p className="auth-card-subtitle">{subtitle}</p> : null}
        {children}
        {footer ? <div className="auth-card-footer">{footer}</div> : null}
      </section>
    </div>
  );
}

