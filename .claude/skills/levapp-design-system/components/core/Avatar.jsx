import React from "react";

const SIZES = { xs: 22, sm: 30, md: 36, lg: 42, xl: 56 };

export function Avatar({ name = "", size = "md", tone = "neutral", src, style, ...rest }) {
  const px = SIZES[size] || SIZES.md;
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
  const tones = {
    neutral: { background: "var(--lv-grey-100)", color: "var(--text-secondary)" },
    accent: { background: "var(--surface-accent)", color: "var(--action-secondary-fg)" },
    solid: { background: "var(--action-primary)", color: "var(--text-on-accent)" },
    inverse: { background: "var(--surface-inverse)", color: "var(--text-on-inverse)" }
  };
  return (
    <div
      title={name}
      style={{
        width: px, height: px, borderRadius: "var(--radius-pill)", flex: "none",
        display: "grid", placeItems: "center", overflow: "hidden",
        font: `600 ${Math.round(px * 0.33)}px/1 var(--font-body)`,
        ...(tones[tone] || tones.neutral), ...style
      }}
      {...rest}
    >
      {src ? <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
    </div>
  );
}

export function AvatarStack({ people = [], max = 3, size = "sm", overflowLabel, ringColor = "var(--surface-card)" }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const px = SIZES[size] || SIZES.sm;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {shown.map((p, i) => (
        <Avatar
          key={i}
          name={typeof p === "string" ? p : p.name}
          tone={typeof p === "string" ? "neutral" : (p.tone || "neutral")}
          size={size}
          style={{ border: `2px solid ${ringColor}`, marginLeft: i === 0 ? 0 : -10 }}
        />
      ))}
      {(rest > 0 || overflowLabel) && (
        <div style={{
          width: px, height: px, borderRadius: "var(--radius-pill)", marginLeft: -10,
          border: `2px solid ${ringColor}`, background: "var(--lv-grey-100)",
          color: "var(--text-secondary)", display: "grid", placeItems: "center",
          font: `600 ${Math.round(px * 0.33)}px/1 var(--font-body)`
        }}>
          {overflowLabel || `+${rest}`}
        </div>
      )}
    </div>
  );
}
