import React from "react";
import { ProgressBar } from "../core/ProgressBar.jsx";

/* Three variables, one block:
   status → the block's whole treatment
   fill   → bar + tabular count
   level  → small Poppins chip, top right                           */
const STATUS = {
  scheduled: { bg: "var(--action-primary)", fg: "var(--lv-white)", meta: "var(--lv-blue-200)", chip: "#9CC6FF", border: "none", bar: "onDark" },
  needsFilling: { bg: "var(--lv-amber-50)", fg: "var(--lv-amber-800)", meta: "var(--lv-amber-700)", chip: "#B98A4A", border: "var(--border-width-strong) dashed var(--status-attention-solid)", bar: "attention" },
  now: { bg: "var(--surface-card)", fg: "var(--action-primary)", meta: "var(--text-secondary)", chip: "var(--text-tertiary)", border: "var(--border-width-strong) solid var(--action-primary)", bar: "accent", shadow: "var(--shadow-accent)" },
  done: { bg: "var(--lv-grey-100)", fg: "var(--text-secondary)", meta: "var(--text-tertiary)", chip: "var(--text-tertiary)", border: "1px solid var(--border-default)", bar: null },
  event: { bg: "var(--status-progress-bg)", fg: "var(--lv-violet-800)", meta: "var(--status-progress-fg)", chip: "var(--status-progress-fg)", border: "none", bar: null, bar4: true }
};

export function ClassBlock({ title, time, court, level, filled, capacity, status = "scheduled", onClick, style }) {
  const s = STATUS[status] || STATUS.scheduled;
  const isEvent = status === "event";
  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: "var(--radius-md)", background: s.bg, border: s.border,
        borderLeft: isEvent ? "3px solid var(--status-progress-solid)" : s.border,
        boxShadow: s.shadow || "none", padding: "10px 12px", cursor: onClick ? "pointer" : "default",
        display: "flex", flexDirection: "column", gap: 7, ...style
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)" }}>
        <span style={{ font: "700 13px/1.3 var(--font-body)", color: s.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        {level && <span style={{ font: "600 11px/1 var(--font-display)", color: s.chip }}>{level}</span>}
      </div>
      <span style={{ font: "400 11px/1.3 var(--font-body)", color: s.meta }}>
        {time}{court ? ` · ${court}` : ""}
      </span>
      {capacity != null && (
        status === "done" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 18, height: 18, borderRadius: "var(--radius-pill)", background: "var(--status-done-solid)", color: "var(--lv-white)", font: "11px/1 var(--font-body)", display: "grid", placeItems: "center" }}>✓</span>
            <span style={{ font: "400 11px/1 var(--font-body)", color: s.meta, fontVariantNumeric: "var(--numeric-tabular)" }}>{filled}/{capacity}</span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <ProgressBar value={filled} max={capacity} tone={s.bar} height={5} style={{ flex: 1 }} />
            <span style={{ font: "600 11px/1 var(--font-body)", color: s.fg, fontVariantNumeric: "var(--numeric-tabular)" }}>{filled}/{capacity}</span>
          </div>
        )
      )}
    </div>
  );
}
