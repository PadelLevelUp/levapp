import React from "react";

export function Input({ label, hint, error, prefix, suffix, multiline = false, style, ...rest }) {
  const Tag = multiline ? "textarea" : "input";
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", ...style }}>
      {label && <span style={{ font: "var(--text-label)", color: "var(--text-secondary)" }}>{label}</span>}
      <span style={{
        display: "flex", alignItems: "center", gap: "var(--space-2)",
        background: "var(--surface-card)",
        border: `1px solid ${error ? "var(--status-problem-solid)" : "var(--border-default)"}`,
        borderRadius: "var(--radius-lg)", padding: multiline ? "12px 14px" : "0 14px",
        minHeight: multiline ? 96 : "var(--control-height-md)"
      }}>
        {prefix}
        <Tag
          style={{
            flex: 1, border: "none", outline: "none", background: "transparent",
            font: "var(--text-body)", color: "var(--text-primary)", resize: multiline ? "vertical" : undefined,
            padding: 0, minHeight: multiline ? 72 : undefined
          }}
          {...rest}
        />
        {suffix}
      </span>
      {(hint || error) && (
        <span style={{ font: "var(--text-caption)", color: error ? "var(--status-problem-fg)" : "var(--text-tertiary)" }}>
          {error || hint}
        </span>
      )}
    </label>
  );
}
