import { Ionicons } from "@expo/vector-icons";
import {
  contrastTextOnNative,
  fadeColorNative,
  lightTheme,
  nativeCalendarSurfaces,
  readableInkNative,
  resolveEventState,
  withAlpha,
  type EventVisualState,
} from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View, type ViewStyle } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { ClassFillBar } from "./ClassFillBar";

type EventCardProps = {
  event: CalendarEvent;
  onPress?: (event: CalendarEvent) => void;
  /** True for the soonest upcoming class in the visible set. */
  isNext?: boolean;
  /** Level code for the chip, e.g. "N3" — resolved from the coach's levels. */
  levelCode?: string;
};

const SURFACES = nativeCalendarSurfaces("light");

/**
 * A class in the selected day's list. React Native port of the web
 * `CalendarEventCard` in its `row` variant.
 *
 * Colour identifies the class; STYLE reports its state. The coach picks the
 * hex from a swatch palette, so nothing here may assume white text reads on it
 * — every text colour comes from `@levelup/config`, the same module the web
 * card uses, so the two platforms cannot drift apart again.
 */
export function EventCard({
  event,
  onPress,
  isNext = false,
  levelCode,
}: EventCardProps) {
  const { t } = useTranslation();
  const state: EventVisualState = resolveEventState(event, { isNext });
  const isBlock = state === "block";
  const isCanceled = state === "canceled";
  const isCompleted = event.status === "completed";
  const isClass = event.type === "class";
  const fallbackTitle = t(
    isClass ? "calendar.eventCard.fallbackTitle" : "calendar.eventCard.fallbackEvent"
  );
  // NOTE: there is deliberately no "spots to fill" outline. It was removed on
  // web at the user's request; the three-part fill bar already shows the gap.

  const hex = !isBlock ? event.color : undefined;

  // Resolved to concrete colours because RN cannot read CSS variables.
  const stateStyle: ViewStyle = {};
  let ink = SURFACES.foreground;
  // Whether the content sits on a saturated fill (→ chip in white) or on a
  // light surface (→ chip in ink).
  let onColor = false;

  if (hex) {
    switch (state) {
      case "next":
        // White body, the class's colour as a 1px border. `borderWidth: 1` —
        // NOT StyleSheet.hairlineWidth, which is thinner than the web rule.
        stateStyle.backgroundColor = SURFACES.card;
        stateStyle.borderWidth = 1;
        stateStyle.borderColor = hex;
        // Title, time, count and the fill bar all take the class's own colour.
        // Blended to stay readable on the card; the raw hex would fail on the
        // pale hues (yellow on white is 1.9:1).
        ink = readableInkNative(hex, SURFACES) ?? SURFACES.foreground;
        break;
      case "past":
        stateStyle.backgroundColor = fadeColorNative(hex, SURFACES) ?? SURFACES.card;
        ink = SURFACES.mutedForeground;
        // 22% of a pale hue over a white card barely reads against the list,
        // so the block keeps an edge without competing with live classes.
        stateStyle.borderWidth = 1;
        stateStyle.borderColor = lightTheme.border;
        break;
      default:
        stateStyle.backgroundColor = hex;
        ink = contrastTextOnNative(hex, SURFACES);
        onColor = ink === "#FFFFFF";
    }
  }

  const capacity = event.maxPlayers ?? 0;
  const filled = event.participantCount ?? 0;
  const confirmed = event.confirmedCount ?? 0;
  const showFill = !isBlock && capacity > 0;

  const chipBackground = onColor
    ? withAlpha("#FFFFFF", 0.2)
    : withAlpha(SURFACES.foreground, 0.1);

  return (
    <Pressable
      testID={`calendar-event-${event.id}`}
      accessibilityLabel={event.title || fallbackTitle}
      // PAD-160: only `onPress` gates this now. It used to also require
      // isClass, which made every blocker/personal/holiday card inert —
      // uneditable and undeletable from the phone.
      accessibilityState={{ disabled: !onPress }}
      role="button"
      disabled={!onPress}
      onPress={() => onPress?.(event)}
      className={cn(
        "gap-1 rounded-xl px-3 py-2.5",
        // A block keeps the muted, dashed treatment it has on the web grid.
        isBlock && "border border-dashed border-border bg-muted",
        // No hex: fall back to the class-type tokens, which are dark enough
        // for white text.
        !isBlock && !hex && (event.classType === "private" ? "bg-private" : "bg-academy"),
        onPress && "active:opacity-90",
        isCanceled && "opacity-50"
      )}
      style={stateStyle}
    >
      {/* Title + level chip. The chip is the only thing allowed on the right,
          so the eye can scan a column of levels. */}
      <View className="flex-row items-start justify-between gap-1">
        <Text
          numberOfLines={1}
          className={cn("flex-shrink text-sm font-semibold", isBlock && "text-muted-foreground")}
          style={
            isBlock
              ? undefined
              : {
                  color: hex ? ink : lightTheme.primaryForeground,
                  textDecorationLine: isCanceled ? "line-through" : "none",
                }
          }
        >
          {event.title || fallbackTitle}
        </Text>
        {levelCode && !isBlock ? (
          <Text
            className="shrink-0 rounded px-1.5 text-xs font-bold leading-5"
            style={{
              color: hex ? ink : lightTheme.primaryForeground,
              backgroundColor: hex ? chipBackground : withAlpha("#FFFFFF", 0.2),
            }}
          >
            {levelCode}
          </Text>
        ) : null}
      </View>

      <View className="flex-row items-center gap-1.5">
        <Text
          className={cn("text-xs", isBlock && "text-muted-foreground")}
          style={
            isBlock ? undefined : { color: hex ? ink : lightTheme.primaryForeground, opacity: 0.8 }
          }
        >
          {event.startTime} – {event.endTime}
        </Text>
        {event.isRecurring ? (
          <Ionicons
            name="repeat-outline"
            size={13}
            color={isBlock || !hex ? lightTheme.mutedForeground : ink}
          />
        ) : null}
      </View>

      {/* Fill: the bar reads before the number does. */}
      {showFill ? (
        <View
          testID={`calendar-event-fill-${event.id}`}
          accessibilityLabel={`${filled}/${capacity}`}
          className="mt-0.5 flex-row items-center gap-1.5"
        >
          <ClassFillBar
            confirmed={confirmed}
            filled={filled}
            capacity={capacity}
            color={hex ? ink : lightTheme.primaryForeground}
          />
          <View className="shrink-0 flex-row items-center gap-0.5">
            {isCompleted ? (
              <Ionicons
                name="checkmark"
                size={12}
                color={hex ? ink : lightTheme.primaryForeground}
              />
            ) : null}
            <Text
              className="text-xs font-semibold"
              style={{ color: hex ? ink : lightTheme.primaryForeground, opacity: 0.9 }}
            >
              {filled}/{capacity}
            </Text>
          </View>
        </View>
      ) : null}

      {isCanceled ? (
        <Text className="text-xs" style={{ color: hex ? ink : lightTheme.primaryForeground }}>
          {t("calendar.eventCard.canceled")}
        </Text>
      ) : null}
    </Pressable>
  );
}
