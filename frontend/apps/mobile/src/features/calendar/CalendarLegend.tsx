import {
  FILL_AWAITING_ALPHA,
  FILL_TRACK_ALPHA,
  lightTheme,
  withAlpha,
} from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * React Native port of web's `CalendarLegend.tsx` (PAD-170 C4, `calendar.view`
 * rule 13 — the product owner decided on 2026-09-04 to port it rather than
 * decline it as an iOS-unneeded surface).
 *
 * The strip and the day list encode three variables at once — status, fill and
 * level — so without this the tinting and the fill bar are unexplained. It sits
 * under the week nav, above the day grid, which is where the treatments it
 * names are visible.
 *
 * The swatches show the TREATMENT, not a fixed palette: the class colour is
 * whatever the coach picked, so each sample uses a neutral stand-in and the
 * distinction carried is the border, the fade and the ring — exactly as on web.
 * The neutral is `mutedForeground` rather than a hardcoded grey so the samples
 * track the theme tokens the cards themselves are built from.
 *
 * The whole row is ONE accessibility element with a text summary. VoiceOver
 * reading five decorative swatches and their labels as five nodes would put
 * five stops between the week nav and the day grid, in a strip a coach swipes
 * through constantly; the legend is reference material, not a control.
 */

/** The neutral stand-in the swatches are drawn in. */
const NEUTRAL = lightTheme.mutedForeground;

export function CalendarLegend({ className }: { className?: string } = {}) {
  const { t } = useTranslation();

  const items = [
    {
      key: "next",
      label: t("calendar.legend.next"),
      // EventCard's "next" state: card body, the class's own colour as a border.
      swatch: (
        <View
          className="h-2.5 w-4 rounded-sm border"
          style={{ backgroundColor: lightTheme.card, borderColor: NEUTRAL }}
        />
      ),
    },
    {
      key: "full",
      label: t("calendar.legend.full"),
      // The default state: the class's colour, solid.
      swatch: (
        <View className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: NEUTRAL }} />
      ),
    },
    {
      key: "done",
      label: t("calendar.legend.done"),
      // The "past" state: colour drained toward the card surface.
      swatch: (
        <View
          className="h-2.5 w-4 rounded-sm border"
          style={{
            backgroundColor: withAlpha(NEUTRAL, 0.2) ?? lightTheme.muted,
            borderColor: lightTheme.border,
          }}
        />
      ),
    },
    {
      key: "event",
      label: t("calendar.legend.event"),
      // A calendar block: muted fill, dashed edge, no class colour at all.
      swatch: (
        <View
          className="h-2.5 w-4 rounded-sm border border-dashed"
          style={{
            backgroundColor: lightTheme.muted,
            borderColor: withAlpha(NEUTRAL, 0.5) ?? lightTheme.border,
          }}
        />
      ),
    },
    {
      key: "fill",
      label: t("calendar.legend.fill"),
      // The three-part ClassFillBar, at the same alphas the real bar uses.
      swatch: (
        <View
          className="h-1.5 w-7 flex-row overflow-hidden rounded-full"
          style={{ backgroundColor: withAlpha(NEUTRAL, FILL_TRACK_ALPHA) ?? NEUTRAL }}
        >
          <View className="h-full w-1/2" style={{ backgroundColor: NEUTRAL }} />
          <View
            className="h-full w-1/4"
            style={{
              backgroundColor: withAlpha(NEUTRAL, FILL_AWAITING_ALPHA) ?? NEUTRAL,
            }}
          />
        </View>
      ),
    },
  ];

  return (
    <View
      testID="calendar-legend"
      accessible
      accessibilityLabel={items.map((item) => item.label).join(", ")}
      className={cn(
        "flex-row flex-wrap items-center gap-x-2.5 gap-y-1 bg-card px-2 pb-1 pt-1",
        className
      )}
    >
      {items.map((item) => (
        <View key={item.key} className="flex-row items-center gap-1">
          {item.swatch}
          <Text className="text-[10px] text-muted-foreground">{item.label}</Text>
        </View>
      ))}
    </View>
  );
}
