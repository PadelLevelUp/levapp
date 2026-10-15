import { Ionicons } from "@expo/vector-icons";
import {
  cardSurfaceNative,
  lightTheme,
  nativeCalendarSurfaces,
  resolveCardVariant,
  relationChip,
  showsEnrolledMark,
  withAlpha,
} from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View, type ViewStyle } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { ClassFillBar } from "./ClassFillBar";
import { useCalendarViewer } from "./viewer-context";

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
 * A card in the selected day's list — calendar.mobile-views rules 5, 7, 8, 24.
 * React Native port of apps/web's `MobileEventCard`.
 *
 * The coach's colour is the class's identity and the treatment is its state:
 * solid when scheduled, outlined when it is the next one, faded when done,
 * red when canceled, dashed when it is a block rather than a class. Every
 * colour is resolved by `@levelup/config` — the same module the web card
 * uses — so the two shells cannot drift apart. Amber appears on the fill bar
 * and the count only, for a class the coach can still fill.
 */
/** Tailwind's `shadow-md` (0 4px 6px rgb(0 0 0 / 0.1)) as React Native style — PAD-675. */
const NEXT_SHADOW: ViewStyle = {
  shadowColor: "#000000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.1,
  shadowRadius: 6,
  elevation: 4,
};

export function EventCard({ event, onPress, isNext = false, levelCode }: EventCardProps) {
  const { t } = useTranslation();
  const viewer = useCalendarViewer();
  const { variant, seatsShort } = resolveCardVariant(event, { isNext, viewer });
  const isBlock = variant === "block";
  const isCanceled = variant === "canceled";
  const surface = cardSurfaceNative(event.color, variant, SURFACES, viewer);
  const ink = isBlock ? SURFACES.foreground : (surface.color ?? SURFACES.foreground);
  const onColor = variant === "scheduled" && ink === "#FFFFFF";

  // PAD-130 / B-541: an open spot is an offer — the shared `open-spot` variant
  // (dashed outline, readable ink), so the ink and the week grid agree with it.
  // PAD-578 (rule 19): a student's own class is ticked — never by colour alone.
  const enrolledMark = showsEnrolledMark(event, variant, viewer);
  // PAD-611 (mobile-views rule 5): the relation chip from the shared helper.
  const chip = relationChip(variant);
  const stateStyle: ViewStyle = isBlock
    ? {}
    : {
        backgroundColor: surface.backgroundColor,
        borderWidth: surface.borderWidth,
        borderStyle: surface.borderStyle,
        borderColor: surface.borderColor,
        // PAD-675: the next class's lift is inline (Tailwind's shadow-md), never a `shadow-md`
        // class added when the card BECOMES next — shadow utilities set CSS variables, and a
        // component that starts setting variables after its first render hits css-interop's
        // upgrade warning, which crashed the debug build ("Couldn't find a navigation context").
        // The student's filter changes which mounted card is next.
        ...(variant === "next" ? NEXT_SHADOW : null),
      };

  const capacity = event.maxPlayers ?? 0;
  const filled = event.participantCount ?? 0;
  const confirmed = event.confirmedCount ?? 0;
  const showFill = !isBlock && !isCanceled && capacity > 0;

  const title =
    event.title ||
    t(isBlock ? "calendar.eventCard.fallbackEvent" : "calendar.eventCard.fallbackTitle");
  const timeRange = `${event.startTime} – ${event.endTime}`;

  const subtitle = isCanceled
    ? t("calendar.eventCard.canceled")
    : isBlock
      ? t(`calendar.eventCard.blockType.${event.blockType ?? "personal"}`, {
          defaultValue: t("calendar.eventCard.block"),
        })
      : null;

  const countColor = seatsShort
    ? onColor
      ? lightTheme.warning
      : lightTheme.warningStrong
    : ink;

  return (
    <Pressable
      testID={`calendar-event-${event.id}`}
      // The label is the bare title: the Maestro `goto-seeded-monday` subflow
      // (and VoiceOver users) find a class by its exact name. The time range
      // is the hint, read after the name.
      accessibilityLabel={title}
      accessibilityHint={timeRange}
      // PAD-160: only `onPress` gates this — a block card must stay tappable
      // so it can be viewed, edited and deleted from the phone.
      accessibilityState={{ disabled: !onPress }}
      role="button"
      disabled={!onPress}
      onPress={() => onPress?.(event)}
      className={cn(
        "rounded-2xl p-4",
        isBlock && "border-[1.5px] border-dashed border-border bg-card",
        onPress && "active:opacity-90"
      )}
      style={stateStyle}
    >
      {chip ? (
        // PAD-664: Maestro cannot read attributes, so the relation is in the wrapper's id.
        <View testID={`calendar-relation-${variant}`} className="self-start">
          <Text
            testID={chip.testId}
            className="mb-1 self-start rounded-full border px-1.5 text-[10px] font-sans-bold uppercase"
            style={{ color: ink, borderColor: ink }}
          >
            {t(chip.key)}
          </Text>
        </View>
      ) : null}
      <View className="flex-row items-start justify-between gap-2">
        {/* PAD-580 QA: the ✓ and the title are ONE leading group — as siblings of the level
            chip in a justify-between row, the title was pushed to the card's right edge. */}
        <View testID="calendar-event-title-group" className="flex-shrink flex-row items-start gap-1.5">
          {enrolledMark ? (
            <Text
              testID="calendar-enrolled-mark"
              accessibilityLabel={t("calendar.eventCard.enrolled")}
              className="text-[15px] font-sans-bold"
              style={{ color: ink }}
            >
              ✓
            </Text>
          ) : null}
          <Text
            numberOfLines={1}
            className="flex-shrink text-[15px] font-sans-bold"
            style={{ color: ink }}
          >
            {title}
          </Text>
        </View>
        {levelCode && !isBlock ? (
          <Text
            className="shrink-0 rounded px-1.5 text-xs font-sans-bold leading-5"
            style={{
              color: ink,
              backgroundColor: onColor
                ? withAlpha("#FFFFFF", 0.2)
                : withAlpha(SURFACES.foreground, 0.1),
            }}
          >
            {levelCode}
          </Text>
        ) : null}
      </View>

      <View className="mt-1 flex-row items-center gap-1.5">
        <Text className="text-sm" style={{ color: ink, opacity: 0.85 }}>
          {timeRange}
        </Text>
        {event.isRecurring ? (
          <Ionicons
            name="repeat-outline"
            size={14}
            color={ink}
            accessibilityLabel={t("calendar.eventCard.recurring")}
          />
        ) : null}
      </View>

      {subtitle ? (
        <Text className="mt-1 text-sm" style={{ color: ink, opacity: 0.85 }}>
          {subtitle}
        </Text>
      ) : null}

      {/* clubs.courts rule 7 (PAD-194): where the class happens. */}
      {!isBlock && event.club ? (
        <Text
          numberOfLines={1}
          testID={`calendar-event-place-${event.id}`}
          className="mt-1 text-sm"
          style={{ color: ink, opacity: 0.85 }}
        >
          {event.court ? `${event.club.name} · ${event.court.name}` : event.club.name}
        </Text>
      ) : null}

      {showFill ? (
        <View
          testID={`calendar-event-fill-${event.id}`}
          accessibilityLabel={`${filled}/${capacity}`}
          className="mt-3.5 flex-row items-center gap-2.5"
        >
          <ClassFillBar
            confirmed={confirmed}
            filled={filled}
            capacity={capacity}
            color={ink}
            tone={seatsShort ? "warning" : "current"}
          />
          <Text className="shrink-0 text-[13px] font-sans-bold" style={{ color: countColor }}>
            {filled}/{capacity}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
