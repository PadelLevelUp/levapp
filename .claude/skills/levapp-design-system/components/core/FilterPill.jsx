import React from "react";

export function FilterPill({ active = false, count, children, onClick, style, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 14px", borderRadius: "var(--radius-pill)", border: "none",
        cursor: "pointer", font: "var(--text-label)", whiteSpace: "nowrap",
        background: active ? "var(--surface-inverse)" : "var(--lv-grey-100)",
        color: active ? "var(--text-on-inverse)" : "var(--text-secondary)",
        transition: "var(--transition-control)", ...style
      }}
      {...rest}
    >
      {children}{count != null && ` ${count}`}
    </button>
  );
}
