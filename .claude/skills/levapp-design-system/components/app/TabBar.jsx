import React from "react";

export function TabBar({ items = [], value, onChange, style }) {
  return (
    <nav style={{
      display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 4,
      borderTop: "1px solid var(--border-subtle)", background: "var(--surface-card)",
      padding: "var(--space-3) var(--space-2) var(--space-4)", ...style
    }}>
      {items.map(item => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange && onChange(item.value)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
              border: "none", background: "transparent", cursor: "pointer", padding: 0, position: "relative"
            }}
          >
            <span style={{
              width: 34, height: 26, borderRadius: 9, display: "grid", placeItems: "center",
              background: active ? "var(--surface-accent)" : "transparent",
              color: active ? "var(--action-primary)" : "var(--text-tertiary)"
            }}>
              {item.icon || <span style={{ width: 12, height: 12, borderRadius: 3, background: "currentColor", display: "block" }} />}
            </span>
            <span style={{ font: active ? "600 10px/1.2 var(--font-body)" : "400 10px/1.2 var(--font-body)", color: active ? "var(--action-primary)" : "var(--text-tertiary)" }}>
              {item.label}
            </span>
            {item.badge != null && (
              <span style={{
                position: "absolute", top: -2, right: 12, minWidth: 16, height: 16, padding: "0 4px",
                borderRadius: "var(--radius-pill)", background: "var(--status-problem-solid)",
                color: "var(--lv-white)", font: "700 10px/16px var(--font-body)", textAlign: "center"
              }}>{item.badge}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
