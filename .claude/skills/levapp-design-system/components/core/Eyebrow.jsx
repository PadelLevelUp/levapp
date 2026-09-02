import React from "react";

export function Eyebrow({ action, onAction, children, style, ...rest }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", ...style }} {...rest}>
      <span style={{ font: "var(--text-eyebrow)", letterSpacing: "var(--tracking-eyebrow)", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
        {children}
      </span>
      {action && (
        <button type="button" onClick={onAction} style={{ border: "none", background: "transparent", cursor: "pointer", font: "var(--text-label)", color: "var(--text-accent)", padding: 0 }}>
          {action}
        </button>
      )}
    </div>
  );
}
