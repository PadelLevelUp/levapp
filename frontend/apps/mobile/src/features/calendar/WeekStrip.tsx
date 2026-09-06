import { Ionicons } from "@expo/vector-icons";
import {
  contrastTextOnNative,
  fadeColorNative,
  lightTheme,
  nativeCalendarSurfaces,
  resolveEventState,
  withAlpha,
} from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { format, isSameDay, isToday } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { dayColumnContent } from "./week-strip-columns";

type WeekStripProps = {
  weekDays: Date[];
  weekLabel: string;
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  /** Events for the visible week, keyed by yyyy-MM-dd and already sorted. */
  eventsByDay?: Record<string, CalendarEvent[]>;
};

const SURFACES = nativeCalendarSurfaces("light");

/**
 * Mon–Sun strip with prev/next week navigation, and each day's classes as
 * small chips underneath. React Native port of the top half of the web
 * `MobileCalendarView`.
 *
 * LAYOUT (`calendar.view` rule 14, PAD-172): this renders TWO siblings — a
 * fixed-height week-nav row, then a `flex-1` day grid. The calendar screen puts
 * a `flex-1` detail list after them, so the grid and the detail list split the
 * space below the nav row in half, exactly as web's `flex-1 min-h-0` /
 * `flex-1` pair does. The strip's share is therefore constant: it neither
 * collapses on an empty week nor grows with the busiest day.
 *
 * Each day column scrolls internally, so a day with more classes than fit is
 * reached by scrolling rather than cut to "+N" — which is why there is no
 * MAX_CHIPS here any more. (An earlier comment in this file claimed the
 * opposite — that the unbounded strip gave iOS a BIGGER share than web. That
 * was inverted at every density: measured 19.0% on iOS vs 50.1% on web at
 * 440x956, which is what PAD-172 fixed.) Web still caps its column at four
 * chips plus "+N"; that is now the lagging side, tracked separately.
 *
 * The chips carry titles rather than bare dots: a coach reads the week by
 * recognising class names, and a count alone cannot tell you which day needs
 * attention. Each chip is tinted with the class's own colour and its text
 * colour is COMPUTED — the previous version hardcoded nothing but a primary
 * dot, and the web version it replaces hardcoded white, which fails on the
 * yellow and lime swatches a coach reaches for to make a class stand out.
 *
 * A day column used to be ONE Pressable wrapping everything, because nesting a
 * Pressable per chip breaks VoiceOver on iOS. The internal scroll made that
 * impossible to keep — a ScrollView inside a Pressable fights the touch
 * responder, the scroll gesture and the day-select tap competing for it. So the
 * column is now a plain View holding a header Pressable and a sibling
 * ScrollView. The a11y contract is unchanged: the HEADER Pressable carries the
 * label, the class-count `accessibilityValue` and the selected state, and the
 * chips stay `accessible={false}`, so VoiceOver still sees exactly one
 * selectable element per day announcing its class count — never one node per
 * chip. Tapping the chip area still selects the day, via a non-accessible
 * Pressable inside the scroll content.
 */
export function WeekStrip({
  weekDays,
  weekLabel,
  selectedDay,
  onSelectDay,
  onPrevWeek,
  onNextWeek,
  onToday,
  eventsByDay = {},
}: WeekStripProps) {
  const { t } = useTranslation();
  return (
    <>
      <View className="flex-row items-center gap-2 bg-card px-2 pt-1">
        <Pressable
          testID="calendar-today"
          accessibilityLabel={t("calendar.toolbar.today")}
          role="button"
          onPress={onToday}
          className="rounded-md border border-input bg-background px-3 py-1.5 active:bg-accent"
        >
          <Text className="text-sm font-medium">
            {t("calendar.toolbar.today")}
          </Text>
        </Pressable>
        <View className="flex-1 flex-row items-center justify-between">
          <Pressable
            testID="calendar-prev-week"
            accessibilityLabel={t("calendar.toolbar.previousWeek")}
            role="button"
            onPress={onPrevWeek}
            className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={lightTheme.foreground}
            />
          </Pressable>
          <Text className="text-sm font-semibold">{weekLabel}</Text>
          <Pressable
            testID="calendar-next-week"
            accessibilityLabel={t("calendar.toolbar.nextWeek")}
            role="button"
            onPress={onNextWeek}
            className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
          >
            <Ionicons
              name="chevron-forward"
              size={20}
              color={lightTheme.foreground}
            />
          </Pressable>
        </View>
      </View>

      <View className="mt-1 flex-1 flex-row border-b border-border bg-card px-2 pb-2">
        {weekDays.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const isSelected = isSameDay(day, selectedDay);
          const dayIsToday = isToday(day);
          const dayEvents = eventsByDay[dayKey] ?? [];
          const { chips } = dayColumnContent(dayEvents);

          return (
            <View
              key={dayKey}
              className={cn(
                "mx-0.5 flex-1 rounded-lg",
                isSelected && "bg-secondary"
              )}
            >
              <Pressable
                testID={`calendar-day-${dayKey}`}
                accessibilityLabel={format(day, "EEEE, MMMM d")}
                accessibilityValue={{
                  text: t("calendar.mobile.classCount", {
                    count: dayEvents.length,
                  }),
                }}
                accessibilityState={{ selected: isSelected }}
                role="button"
                onPress={() => onSelectDay(day)}
                className={cn(
                  "items-stretch rounded-t-lg px-0.5 pt-1.5",
                  !isSelected && "active:bg-accent"
                )}
              >
                <Text className="text-center text-[10px] uppercase text-muted-foreground">
                  {format(day, "EEE")}
                </Text>
                <Text
                  className={cn(
                    "mx-auto h-7 w-7 rounded-full text-center text-sm font-semibold leading-7",
                    dayIsToday ? "text-primary-foreground" : "text-foreground"
                  )}
                  // The selected-day wash is an explicit rgba rather than
                  // `bg-primary/20`. Measured: React Native's own colour parser
                  // rejects the slash-alpha form (`hsl(h s% l% / a)`) that
                  // Tailwind emits for `/opacity` modifiers. Whether NativeWind
                  // rewrites that before RN ever sees it is NOT established here
                  // — this rgba is correct under either path.
                  style={{
                    backgroundColor: dayIsToday
                      ? lightTheme.primary
                      : isSelected
                        ? withAlpha(lightTheme.primary, 0.2)
                        : undefined,
                  }}
                >
                  {format(day, "d")}
                </Text>
              </Pressable>

              {/* The column's own scroller: this is what absorbs a busy day,
                  instead of the strip growing or the list being cut to "+N".
                  `accessible={false}` on the inner Pressable keeps VoiceOver
                  seeing one selectable element per day — the header above.

                  Two things below are load-bearing, not cosmetic:

                  1. `grow` on BOTH the content container and the inner
                     Pressable. Rule 14 makes this column ~half the screen tall,
                     but its chips only fill as much of it as the day is busy.
                     Without `grow`, a day with no classes gives the Pressable
                     zero height, so everything under the ~47pt header is a dead
                     zone — the tap lands on the ScrollView and the day is never
                     selected. That regression arrives with the full-height
                     column and hits exactly the quiet week this rule exists for.
                     With `grow` the Pressable stretches to the whole scroller
                     and the entire column selects its day, as it did when the
                     column was content-sized.
                     It must be `grow` (flexGrow:1, flexBasis auto) and NOT
                     `flex-1` (flexGrow:1 + flexBasis 0): a flex-basis-0 child of
                     a scroll content container takes its height from the
                     scroller rather than from its content, which squashes a busy
                     day back to one screenful and kills the internal scrolling
                     this change exists to add.

                  2. The vertical scroll indicator stays visible. With "+N" gone
                     it is the only signal that a busy column continues below the
                     fold; hiding it makes those classes undiscoverable. */}
              <ScrollView
                className="flex-1"
                contentContainerClassName="grow px-0.5 pb-1.5"
                showsVerticalScrollIndicator
              >
                <Pressable
                  accessible={false}
                  onPress={() => onSelectDay(day)}
                  className="grow gap-1"
                >
                  {chips.map((event) => {
                    const isBlockEvent = event.type === "block";
                    const past = resolveEventState(event) === "past";
                    const tint = event.color;

                    const background = isBlockEvent
                      ? lightTheme.muted
                      : past
                        ? (fadeColorNative(tint, SURFACES) ?? SURFACES.card)
                        : (tint ?? lightTheme.primary);
                    const foreground = isBlockEvent
                      ? lightTheme.mutedForeground
                      : past
                        ? SURFACES.mutedForeground
                        : tint
                          ? contrastTextOnNative(tint, SURFACES)
                          : lightTheme.primaryForeground;

                    return (
                      <View
                        key={String(event.id)}
                        testID={`calendar-day-chip-${event.id}`}
                        className="min-h-[32px] justify-center rounded px-1 py-1"
                        style={{
                          backgroundColor: background,
                          opacity: past ? 0.45 : 1,
                        }}
                      >
                        {/* RN has no line-clamp: numberOfLines is the only
                            thing that bounds a wrapped title. */}
                        <Text
                          numberOfLines={3}
                          className="text-[9px] font-medium leading-[11px]"
                          style={{ color: foreground }}
                        >
                          {event.title}
                        </Text>
                      </View>
                    );
                  })}
                </Pressable>
              </ScrollView>
            </View>
          );
        })}
      </View>
    </>
  );
}
