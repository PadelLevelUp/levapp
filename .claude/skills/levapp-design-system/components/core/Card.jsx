import React from "react";

const ACCENTS = {
  attention: "var(--status-attention-solid)",
  accent: "var(--action-primary)",
  problem: "var(--status-problem-solid)",
  progress: "var(--status-progress-solid)"
};

export function Card({ tone = "default", accent, padding = "var(--space-5)", floating = false, children, style, ...rest }) {
  const inverse = tone === "inverse";
  const sunken = tone === "sunken";
  return (
    <div
      style={{
        background: inverse
          ? "linear-gradient(150deg, var(--lv-navy-700) 0%, var(--lv-ink-900) 100%)"
          : sunken ? "var(--surface-sunken)" : "var(--surface-card)",
        border: inverse || sunken ? "none" : "1px solid var(--border-subtle)",
        borderLeft: accent ? `var(--accent-bar-width) solid ${ACCENTS[accent] || accent}` : undefined,
        borderRadius: "var(--radius-2xl)",
        boxShadow: floating ? "var(--shadow-lg)" : "none",
        color: inverse ? "var(--text-on-inverse)" : "var(--text-primary)",
        padding, ...style
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
