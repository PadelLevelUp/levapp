import React from "react";
import { Card } from "../core/Card.jsx";

export function StatCard({ label, value, sub, delta, deltaTone = "done", bars, tone = "default", style }) {
  const deltaColor = deltaTone === "attention" ? "var(--status-attention-fg)"
    : deltaTone === "problem" ? "var(--status-problem-fg)" : "var(--status-done-fg)";
  return (
    <Card padding="var(--space-5)" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-3)" }}>
        <span style={{ font: "var(--text-body-strong)", color: "var(--text-secondary)" }}>{label}</span>
        {delta && <span style={{ font: "var(--text-label)", color: deltaColor }}>{delta}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)" }}>
        <span style={{
          font: "var(--text-metric)", letterSpacing: "var(--tracking-display)",
          fontVariantNumeric: "var(--numeric-tabular)",
          color: tone === "attention" ? "var(--status-attention-fg)" : "var(--text-primary)"
        }}>{value}</span>
        {sub && <span style={{ font: "var(--text-caption)", color: "var(--text-tertiary)" }}>{sub}</span>}
      </div>
      {bars && bars.length > 0 && (
        <div style={{ display: "flex", gap: 5, alignItems: "flex-end", height: 46 }}>
          {bars.map((h, i) => (
            <div key={i} style={{
              flex: 1, height: `${Math.max(4, h)}%`, borderRadius: 4,
              background: i === bars.length - 1 ? "var(--action-primary)"
                : i >= bars.length - 2 ? "var(--lv-blue-500)"
                : i >= bars.length - 4 ? "var(--lv-blue-200)" : "var(--surface-accent)"
            }} />
          ))}
        </div>
      )}
    </Card>
  );
}
