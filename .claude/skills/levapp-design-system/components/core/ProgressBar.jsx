import React from "react";

const TONES = {
  accent: { fill: "var(--action-primary)", track: "var(--lv-grey-150)" },
  done: { fill: "var(--status-done-solid)", track: "var(--lv-grey-150)" },
  attention: { fill: "var(--status-attention-solid)", track: "#F3E4CE" },
  onDark: { fill: "var(--lv-white)", track: "rgba(255,255,255,0.28)" }
};

export function ProgressBar({ value = 0, max = 1, tone = "accent", height = 6, style }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0)) * 100;
  const t = TONES[tone] || TONES.accent;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max}
      style={{ height, borderRadius: "var(--radius-pill)", background: t.track, overflow: "hidden", ...style }}
    >
      <div style={{ width: `${pct}%`, height: "100%", background: t.fill, borderRadius: "var(--radius-pill)", transition: `width var(--duration-slow) var(--ease-out)` }} />
    </div>
  );
}
