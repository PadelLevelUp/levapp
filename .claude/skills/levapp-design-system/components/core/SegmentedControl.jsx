import React from "react";

export function SegmentedControl({ options = [], value, onChange, style }) {
  return (
    <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--lv-grey-100)", borderRadius: "var(--radius-lg)", ...style }}>
      {options.map(opt => {
        const o = typeof opt === "string" ? { value: opt, label: opt } : opt;
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange && onChange(o.value)}
            style={{
              flex: 1, padding: "9px 12px", border: "none", cursor: "pointer",
              borderRadius: "var(--radius-md)", font: "var(--text-label)",
              background: active ? "var(--surface-card)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: active ? "var(--shadow-sm)" : "none",
              transition: "var(--transition-control)", whiteSpace: "nowrap"
            }}
          >
            {o.label}{o.count != null && ` · ${o.count}`}
          </button>
        );
      })}
    </div>
  );
}
