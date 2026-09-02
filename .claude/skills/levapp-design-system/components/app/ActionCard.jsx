import React from "react";
import { Card } from "../core/Card.jsx";
import { Button } from "../core/Button.jsx";
import { Avatar } from "../core/Avatar.jsx";

export function ActionCard({ title, detail, accent, person, primaryLabel, onPrimary, secondaryLabel, onSecondary, style }) {
  return (
    <Card accent={accent} padding="var(--space-4)" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", ...style }}>
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
        {person && <Avatar name={person} tone="accent" size="md" />}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          <span style={{ font: "var(--text-title)", color: "var(--text-primary)" }}>{title}</span>
          {detail && <span style={{ font: "var(--text-caption)", color: "var(--text-secondary)" }}>{detail}</span>}
        </div>
      </div>
      {(primaryLabel || secondaryLabel) && (
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          {primaryLabel && <Button variant="primary" onClick={onPrimary} style={{ flex: 1 }}>{primaryLabel}</Button>}
          {secondaryLabel && <Button variant="ghost" onClick={onSecondary}>{secondaryLabel}</Button>}
        </div>
      )}
    </Card>
  );
}
