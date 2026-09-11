import { clampSheetTop, type SheetBounds } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { EmptyState } from "@/components/empty-state";
import { DayHeader } from "./DayHeader";
import { EventCard } from "./EventCard";
import { FAB_CLEARANCE } from "./layout";
import {
  SHEET_COLLAPSED_HEIGHT,
  SHEET_HANDLE_HEIGHT,
  SHEET_SHADOW,
  SHEET_TOP_RADIUS,
} from "./sheet-chrome";

export { SHEET_COLLAPSED_HEIGHT };

const TOP_CORNERS = {
  borderTopLeftRadius: SHEET_TOP_RADIUS,
  borderTopRightRadius: SHEET_TOP_RADIUS,
} as const;

/**
 * The day sheet over the Semana / Mês grid — calendar.mobile-views rule 3.
 * React Native port of apps/web's `DaySheet`: absolutely positioned in the
 * grid container, its top edge `top` pt down, dragged on the handle row or the
 * day header with the gesture handler and clamped by the shared
 * `clampSheetTop`. The pan runs on the JS thread (`runOnJS(true)`) — the same
 * pattern as the tactical board — because the sheet's position is plain React
 * state.
 *
 * Two nested views (B-065): the outer one casts the upward shadow and must not
 * clip, the inner one clips the content to the rounded top corners.
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
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, top, ...TOP_CORNERS, ...SHEET_SHADOW }}
      className="bg-background"
    >
      <View style={TOP_CORNERS} className="flex-1 overflow-hidden bg-background">
        <GestureDetector gesture={pan}>
          <View testID="calendar-sheet-grab">
            <View
              testID="calendar-sheet-handle"
              accessibilityRole="adjustable"
              accessibilityLabel={t("calendar.sheet.handle")}
              style={{ height: SHEET_HANDLE_HEIGHT }}
              className="items-center justify-center"
            >
              <View className="h-[5px] w-10 rounded-full bg-primary" />
            </View>
            <DayHeader day={day} count={events.length} />
          </View>
        </GestureDetector>
        <ScrollView
          testID="calendar-sheet-list"
          className="flex-1"
          contentContainerClassName="gap-3 px-5 pt-3"
          // Rule 18: clear of the floating add buttons at the end of the list.
          contentContainerStyle={{ paddingBottom: FAB_CLEARANCE }}
        >
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
    </View>
  );
}
