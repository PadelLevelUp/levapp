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
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";

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
 * The most chips a day column shows before collapsing the rest into "+N".
 * Matches the web mobile view so the two platforms overflow at the same point.
 *
 * LAYOUT DEVIATION worth knowing: web bounds its strip at half the screen
 * (`flex-1 min-h-0 overflow-hidden`) and scrolls each day column internally.
 * There is no clean RN equivalent inside a single Pressable, so this strip is
 * unbounded and simply cannot exceed MAX_CHIPS. The busiest day sets the
 * height of all seven columns: 4 chips x 32px + gaps + the ~70px header is
 * roughly 210px on a 390x844 screen. Bounded, but a bigger share of the screen
 * than web gives it. Lower this to 3 if the detail list feels squeezed.
 */
const MAX_CHIPS = 4;

/**
 * Mon–Sun strip with prev/next week navigation, and each day's classes as
 * small chips underneath. React Native port of the top half of the web
 * `MobileCalendarView`.
 *
 * The chips carry titles rather than bare dots: a coach reads the week by
 * recognising class names, and a count alone cannot tell you which day needs
 * attention. Each chip is tinted with the class's own colour and its text
 * colour is COMPUTED — the previous version hardcoded nothing but a primary
 * dot, and the web version it replaces hardcoded white, which fails on the
 * yellow and lime swatches a coach reaches for to make a class stand out.
 *
 * The whole day column is ONE Pressable with plain Views inside. Nesting a
 * Pressable per chip breaks VoiceOver on iOS, and the chips are not
 * individually actionable anyway — tapping anywhere selects the day.
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
  const locale = useDateLocale();
  return (
    <View className="border-b border-border bg-card px-2 pb-2 pt-1">
      <View className="flex-row items-center gap-2">
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
            <Ionicons name="chevron-back" size={20} color={lightTheme.foreground} />
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

      <View className="mt-1 flex-row">
        {weekDays.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const isSelected = isSameDay(day, selectedDay);
          const dayIsToday = isToday(day);
          const dayEvents = eventsByDay[dayKey] ?? [];

          return (
            <Pressable
              key={dayKey}
              testID={`calendar-day-${dayKey}`}
              accessibilityLabel={format(day, "EEEE, MMMM d", { locale })}
              accessibilityValue={{
                text: t("calendar.mobile.classCount", { count: dayEvents.length }),
              }}
              accessibilityState={{ selected: isSelected }}
              role="button"
              onPress={() => onSelectDay(day)}
              className={cn(
                "mx-0.5 flex-1 items-stretch rounded-lg px-0.5 py-1.5",
                isSelected ? "bg-secondary" : "active:bg-accent"
              )}
            >
              <Text className="text-center text-[10px] uppercase text-muted-foreground">
                {format(day, "EEE", { locale })}
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

              <View className="mt-1 gap-1">
                {dayEvents.slice(0, MAX_CHIPS).map((event) => {
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
                      style={{ backgroundColor: background, opacity: past ? 0.45 : 1 }}
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
                {dayEvents.length > MAX_CHIPS ? (
                  <Text className="text-[9px] leading-none text-muted-foreground">
                    +{dayEvents.length - MAX_CHIPS}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
