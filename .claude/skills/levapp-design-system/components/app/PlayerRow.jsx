import React from "react";
import { Avatar } from "../core/Avatar.jsx";
import { Badge } from "../core/Badge.jsx";

export function PlayerRow({ name, level, hand, flags = [], attendance, selectable = false, selected = false, onSelect, meta, trailing, style }) {
  return (
    <div
      onClick={selectable ? onSelect : undefined}
      style={{
        display: "flex", alignItems: "center", gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)", background: "var(--surface-card)",
        cursor: selectable ? "pointer" : "default", ...style
      }}
    >
      {selectable && (
        <span style={{
          width: 22, height: 22, flex: "none", borderRadius: 7, display: "grid", placeItems: "center",
          background: selected ? "var(--action-primary)" : "transparent",
          border: selected ? "none" : "1.5px solid var(--border-strong)",
          color: "var(--text-on-accent)", font: "700 13px/1 var(--font-body)"
        }}>{selected ? "✓" : ""}</span>
      )}
      <Avatar name={name} size="md" />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ font: "var(--text-title)", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        {meta ? (
          <span style={{ font: "var(--text-caption)", color: "var(--text-tertiary)" }}>{meta}</span>
        ) : (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {level && <Badge tone="progress" size="sm">Nível {level}</Badge>}
            {hand && <Badge tone="neutral" size="sm">{hand}</Badge>}
            {flags.map((fl, i) => <Badge key={i} tone={fl.tone || "attention"} size="sm">{fl.label}</Badge>)}
          </div>
        )}
      </div>
      {attendance && (
        <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }} title="Últimas 8 aulas">
          {attendance.map((present, i) => (
            <span key={i} style={{ width: 5, height: 16, borderRadius: 2, background: present ? "var(--status-done-solid)" : "var(--lv-grey-150)" }} />
          ))}
        </div>
      )}
      {trailing}
    </div>
  );
}
