import React from "react";

export function Toggle({ checked = false, onChange, disabled = false, label, style }) {
  const el = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange && onChange(!checked)}
      style={{
        width: 46, height: 27, flex: "none", padding: 3, borderRadius: "var(--radius-pill)",
        border: "none", cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? "var(--action-primary)" : "var(--border-default)",
        display: "flex", justifyContent: checked ? "flex-end" : "flex-start",
        opacity: disabled ? 0.5 : 1, transition: "var(--transition-control)", ...style
      }}
    >
      <span style={{ width: 21, height: 21, borderRadius: "var(--radius-pill)", background: "var(--lv-white)", boxShadow: "var(--shadow-sm)" }} />
    </button>
  );
  if (!label) return el;
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", font: "var(--text-body-strong)", color: "var(--text-primary)" }}>
      {el}{label}
    </label>
  );
}
