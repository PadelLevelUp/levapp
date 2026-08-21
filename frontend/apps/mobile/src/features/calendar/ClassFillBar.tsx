import {
  FILL_AWAITING_ALPHA,
  FILL_TRACK_ALPHA,
  withAlpha,
} from "@levelup/config";
import * as React from "react";
import { View } from "react-native";

/**
 * How full a class is, split three ways:
 *
 *   confirmed   players who actively said yes        (solid)
 *   awaiting    enrolled but not yet answered        (half-strength)
 *   free        seats still to fill                  (track)
 *
 * `participantCount` from the API is confirmed + awaiting — a player who has
 * not answered still holds their spot. So "7/16" alone cannot tell you whether
 * those 7 are coming; the split can.
 *
 * React Native port of apps/web/src/components/calendar/ClassFillBar.tsx. The
 * web version draws in `currentColor`, inheriting a colour the card has
 * already proven legible against whatever hue the coach picked. RN has no
 * colour inheritance for `backgroundColor`, so the caller passes that resolved
 * colour in as `color` and the tints are computed from it.
 */
export function ClassFillBar({
  confirmed,
  filled,
  capacity,
  color,
}: {
  confirmed: number;
  /** Spots taken — confirmed plus not-yet-answered. */
  filled: number;
  capacity: number;
  /** The already-legible ink for this card. Must be a concrete colour. */
  color: string;
}) {
  if (!capacity || capacity <= 0) return null;

  const safeFilled = Math.max(0, Math.min(filled, capacity));
  const safeConfirmed = Math.max(0, Math.min(confirmed, safeFilled));
  const pct = (n: number) => `${(n / capacity) * 100}%` as const;

  // An undefined backgroundColor renders transparent in RN without an error,
  // which would silently erase the split. Falling back to the solid colour
  // keeps the bar visible if `color` ever arrives in a notation withAlpha
  // cannot read.
  const track = withAlpha(color, FILL_TRACK_ALPHA) ?? color;
  const awaiting = withAlpha(color, FILL_AWAITING_ALPHA) ?? color;

  return (
    <View
      testID="class-fill-bar"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: capacity, now: safeConfirmed }}
      className="h-1.5 flex-1 flex-row overflow-hidden rounded-full"
      style={{ backgroundColor: track }}
    >
      <View style={{ width: pct(safeConfirmed), backgroundColor: color }} />
      <View
        style={{
          width: pct(safeFilled - safeConfirmed),
          backgroundColor: awaiting,
        }}
      />
    </View>
  );
}
