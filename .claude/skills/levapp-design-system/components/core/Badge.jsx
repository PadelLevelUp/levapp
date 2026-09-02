import React from "react";

const TONES = {
  neutral: { background: "var(--lv-grey-100)", color: "var(--text-secondary)" },
  accent: { background: "var(--surface-accent)", color: "var(--action-secondary-fg)" },
  done: { background: "var(--status-done-bg)", color: "var(--status-done-fg)" },
  attention: { background: "var(--status-attention-bg)", color: "var(--status-attention-fg)" },
  problem: { background: "var(--status-problem-bg)", color: "var(--status-problem-fg)" },
  progress: { background: "var(--status-progress-bg)", color: "var(--status-progress-fg)" }
};

export function Badge({ tone = "neutral", size = "md", children, style, ...rest }) {
  const t = TONES[tone] || TONES.neutral;
  const small = size === "sm";
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: "6px",
        padding: small ? "3px 9px" : "6px 12px",
        borderRadius: "var(--radius-pill)",
        font: small ? "var(--text-micro)" : "var(--text-label)",
        whiteSpace: "nowrap", ...t, ...style
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
