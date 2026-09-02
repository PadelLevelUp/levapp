import React from "react";
import { Avatar } from "../core/Avatar.jsx";
import { Badge } from "../core/Badge.jsx";

export function MessageRow({ name, preview, time, state = "waiting", actions = [], onClick, style }) {
  const unread = state === "unread";
  const closed = state === "declined";
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", gap: "var(--space-3)", alignItems: "flex-start",
        padding: "var(--space-4) var(--space-5)",
        background: unread ? "var(--surface-accent-soft)" : "var(--surface-card)",
        borderLeft: unread ? "3px solid var(--action-primary)" : "3px solid transparent",
        opacity: closed ? 0.55 : 1, cursor: onClick ? "pointer" : "default", ...style
      }}
    >
      <Avatar name={name} tone={unread ? "accent" : "neutral"} size="lg" />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-3)" }}>
          <span style={{ font: unread ? "var(--text-title)" : "600 15px/1.35 var(--font-body)", color: "var(--text-primary)" }}>{name}</span>
          <span style={{ font: "400 12px/1 var(--font-body)", color: "var(--text-tertiary)", flex: "none" }}>{time}</span>
        </div>
        <span style={{ font: "var(--text-caption)", color: unread ? "var(--text-primary)" : "var(--text-secondary)" }}>{preview}</span>
        {actions.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            {actions.map((a, i) => <Badge key={i} tone={a.tone || "accent"} size="sm">{a.label}</Badge>)}
          </div>
        )}
      </div>
    </div>
  );
}
