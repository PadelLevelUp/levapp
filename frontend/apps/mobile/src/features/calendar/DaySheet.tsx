import { clampSheetTop, type SheetBounds } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { EmptyState } from "@/components/empty-state";
import { DayHeader } from "./DayHeader";
import { EventCard } from "./EventCard";

/** Handle row (18pt) plus the DayHeader's height: what stays visible at `max`. */
export const SHEET_COLLAPSED_HEIGHT = 18 + 76;

/**
 * The day sheet over the Semana / Mês grid — calendar.mobile-views rule 3.
 * React Native port of apps/web's `DaySheet`: absolutely positioned in the
 * grid container, its top edge `top` pt down, dragged on the handle with the
 * gesture handler and clamped by the shared `clampSheetTop`. The pan runs
 * on the JS thread (`runOnJS(true)`) — the same pattern as the tactical
 * board — because the sheet's position is plain React state.
 */
export function DaySheet({
  top,
  bounds,
  onTopChange,
  day,
  events,
  nextEventId,
  levelCodeById,
  onEventPress,
}: {
  top: number;
  bounds: SheetBounds;
  onTopChange: (top: number) => void;
  day: Date;
  events: CalendarEvent[];
  nextEventId?: string;
  levelCodeById: Map<string, string>;
  onEventPress?: (event: CalendarEvent) => void;
}) {
  const { t } = useTranslation();
  const startTop = React.useRef(top);

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          startTop.current = top;
        })
        .onUpdate((e) => {
          onTopChange(clampSheetTop(startTop.current + e.translationY, bounds));
        }),
    [top, bounds, onTopChange]
  );

  return (
    <View
      testID="calendar-day-sheet"
      accessibilityValue={{ min: bounds.min, max: bounds.max, now: top }}
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, top }}
      className="overflow-hidden rounded-t-[20px] bg-background shadow-lg"
    >
      <GestureDetector gesture={pan}>
        <View
          testID="calendar-sheet-handle"
          accessibilityRole="adjustable"
          accessibilityLabel={t("calendar.sheet.handle")}
          className="h-[18px] items-center justify-center"
        >
          <View className="h-1 w-8 rounded-full bg-border" />
        </View>
      </GestureDetector>
      <DayHeader day={day} count={events.length} />
      <ScrollView className="flex-1" contentContainerClassName="gap-3 px-5 pb-32 pt-3">
        {events.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title={t("calendar.mobile.noClasses")}
            message={t("calendar.mobile.noClassesScheduled")}
            className="py-8"
          />
        ) : (
          events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onPress={onEventPress}
              isNext={event.id === nextEventId}
              levelCode={
                event.levelId !== undefined ? levelCodeById.get(String(event.levelId)) : undefined
              }
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}
