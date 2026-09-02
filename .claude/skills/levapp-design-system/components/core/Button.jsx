import React from "react";

const SIZES = {
  sm: { height: "var(--control-height-sm)", padding: "0 14px", font: "var(--text-label)", radius: "var(--radius-md)" },
  md: { height: "var(--control-height-md)", padding: "0 20px", font: "var(--text-body-strong)", radius: "var(--radius-lg)" },
  lg: { height: "var(--control-height-lg)", padding: "0 24px", font: "600 15px/1.4 var(--font-body)", radius: "var(--radius-lg)" }
};

const VARIANTS = {
  primary: { background: "var(--action-primary)", color: "var(--text-on-accent)", border: "1px solid transparent" },
  secondary: { background: "var(--action-secondary-bg)", color: "var(--action-secondary-fg)", border: "1px solid transparent" },
  ghost: { background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-default)" },
  quiet: { background: "transparent", color: "var(--text-accent)", border: "1px solid transparent" },
  danger: { background: "transparent", color: "var(--action-danger)", border: "1px solid var(--border-default)" }
};

export function Button({ variant = "primary", size = "md", fullWidth = false, disabled = false, iconLeft, iconRight, children, style, ...rest }) {
  const s = SIZES[size] || SIZES.md;
  const v = VARIANTS[variant] || VARIANTS.primary;
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: "var(--space-2)", height: s.height, padding: s.padding, font: s.font,
        borderRadius: s.radius, cursor: disabled ? "not-allowed" : "pointer",
        width: fullWidth ? "100%" : undefined, opacity: disabled ? 0.45 : 1,
        transition: "var(--transition-control)", whiteSpace: "nowrap", ...v, ...style
      }}
      {...rest}
    >
      {iconLeft}{children}{iconRight}
    </button>
  );
}
