import React from "react";
import { Avatar } from "../core/Avatar.jsx";

export function ScreenHeader({ title, meta, eyebrow, user, actions, style }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "var(--space-4)", padding: "var(--space-5) var(--space-5) var(--space-4)", ...style }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        {eyebrow && <span style={{ font: "var(--text-caption)", color: "var(--text-tertiary)" }}>{eyebrow}</span>}
        <h1 style={{ margin: 0, font: "var(--text-display-md)", letterSpacing: "var(--tracking-display)", color: "var(--text-primary)" }}>{title}</h1>
        {meta && <span style={{ font: "var(--text-caption)", color: "var(--text-tertiary)" }}>{meta}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        {actions}
        {user && <Avatar name={user} tone="inverse" size="lg" />}
      </div>
    </div>
  );
}
