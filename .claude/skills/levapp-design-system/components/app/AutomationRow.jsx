import React from "react";
import { Card } from "../core/Card.jsx";
import { Toggle } from "../core/Toggle.jsx";

export function AutomationRow({ title, rule, enabled = true, onToggle, stats = [], template, style }) {
  return (
    <Card padding="var(--space-4)" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", opacity: enabled ? 1 : 0.7, ...style }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          <span style={{ font: "var(--text-title)", color: "var(--text-primary)" }}>{title}</span>
          {rule && <span style={{ font: "var(--text-caption)", color: "var(--text-secondary)" }}>{rule}</span>}
        </div>
        <Toggle checked={enabled} onChange={onToggle} />
      </div>
      {template && (
        <div style={{ borderRadius: "var(--radius-lg)", background: "var(--surface-accent-soft)", padding: "12px 14px", font: "var(--text-caption)", color: "var(--text-primary)" }}>
          {template}
        </div>
      )}
      {stats.length > 0 && (
        <div style={{ display: "flex", gap: "var(--space-4)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border-subtle)" }}>
          {stats.map((s, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{
                font: "700 18px/1 var(--font-display)", fontVariantNumeric: "var(--numeric-tabular)",
                color: s.tone === "done" ? "var(--status-done-fg)" : s.tone === "attention" ? "var(--status-attention-fg)" : "var(--text-primary)"
              }}>{s.value}</span>
              <span style={{ font: "400 11px/1.2 var(--font-body)", color: "var(--text-tertiary)" }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
