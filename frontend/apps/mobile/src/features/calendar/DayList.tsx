import { isClubToday } from "@levelup/config";
import type { useDayList } from "@levelup/hooks";
import type { CalendarEvent } from "@levelup/types";
import { format } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Pressable, ScrollView, View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { DayHeader } from "./DayHeader";
import { EventCard } from "./EventCard";
import { FAB_CLEARANCE } from "./layout";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Rule 26b: a movement inside the loaded range lasts one second at most. */
const MOVE_LIMIT_MS = 1000;

type LayoutEvent = { nativeEvent: { layout: { y: number; height: number } } };
type ScrollEvent = { nativeEvent: { contentOffset: { y: number } } };
type ScrollHandle = { scrollTo: (to: { y: number; animated: boolean }) => void };

/**
 * Dia's one list of days — calendar.mobile-views rule 26 (iOS).
 *
 * A ScrollView, not a FlatList or SectionList: card heights are not known before layout (text size changes them)
 * and those two did not open at the right day without them. Each day is a header (a direct child, so
 * `stickyHeaderIndices` can name it; its `onLayout` gives the day's offset) and its cards. The list is hidden
 * until it has scrolled to the opening day. The state — what is loaded, which day is selected while the list
 * scrolls, the target a date / chevron / Hoje / link sets — is `useDayList`'s; this draws it and reports where
 * the list is.
 *
 * One mechanism keeps the place: an anchor (a day and how far into it the reader is). The target sets it, and
 * every later layout pass (days prepended or replaced above, a refresh, a text size change) that moves the
 * anchor's day puts the list back on it without animation.
 */
export function DayList({
  list,
  eventsByDay,
  nextEventId,
  levelCodeById,
  onEventPress,
  selectedDay,
  onToday,
  todayBottom = 26,
  refreshControl,
}: {
  list: ReturnType<typeof useDayList>;
  /** The loaded days' events (the student's filter already applied), each day in start-time order. */
  eventsByDay: Record<string, CalendarEvent[]>;
  nextEventId?: string;
  levelCodeById: Map<string, string>;
  onEventPress?: (event: CalendarEvent) => void;
  selectedDay: Date;
  /** Rule 26f: Hoje moves the selected day to today. */
  onToday: () => void;
  /** Hoje's distance from the bottom, so its centre is the add-event button's. */
  todayBottom?: number;
  refreshControl?: React.ReactElement<React.ComponentProps<typeof import("react-native").RefreshControl>>;
}) {
  const { t } = useTranslation();
  const scroller = React.useRef<ScrollHandle | null>(null);
  const offsets = React.useRef(new Map<string, number>());
  const heights = React.useRef(new Map<string, number>());
  const scrollY = React.useRef(0);
  const viewport = React.useRef(0);
  const contentReady = React.useRef(false);
  const touched = React.useRef(false);
  const moving = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchor = React.useRef<{ day: string; delta: number } | null>(null);
  const placed = React.useRef(false);
  const reduceMotion = React.useRef(false);
  const [ready, setReady] = React.useState(false);
  const [filler, setFiller] = React.useState(FAB_CLEARANCE);

  const { days, status, target, jumping } = list;
  const targetIso = target ? iso(target) : null;
  const firstDay = days.length ? iso(days[0]) : null;

  React.useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled?.()?.then((on) => {
      reduceMotion.current = on;
    });
  }, []);

  // A range that replaced the one on screen (a jump outside it) is another list: hidden until it has scrolled to
  // its target. Days that only grew at the end are the same list.
  const rangeStart = React.useRef(firstDay);
  if (rangeStart.current !== firstDay) {
    rangeStart.current = firstDay;
    if (targetIso) {
      placed.current = false;
      setReady(false);
    }
  }

  const positions = React.useCallback(
    () =>
      days.flatMap((d) => {
        const top = offsets.current.get(iso(d));
        return top === undefined ? [] : [{ date: iso(d), top }];
      }),
    [days]
  );

  const finishMove = React.useCallback(
    (day: string) => {
      if (moving.current) clearTimeout(moving.current);
      moving.current = null;
      anchor.current = { day, delta: 0 };
      list.settled();
    },
    [list]
  );

  // Puts the list where it belongs after any layout pass: on the target once its header is measured, else back on
  // the anchor if its day has moved. Idempotent: calling it twice scrolls once.
  const reconcile = React.useCallback(() => {
    const handle = scroller.current;
    if (!handle || !contentReady.current || moving.current || status !== "ready") return;
    if (targetIso) {
      const y = offsets.current.get(targetIso);
      if (y === undefined || jumping) return;
      touched.current = false;
      if (!placed.current || reduceMotion.current) {
        placed.current = true;
        scrollY.current = y;
        handle.scrollTo({ y, animated: false });
        setReady(true);
        finishMove(targetIso);
        return;
      }
      // A movement inside the range: smooth, ends with the scroll animation, a touch, or the second's limit.
      moving.current = setTimeout(() => finishMove(targetIso), MOVE_LIMIT_MS);
      handle.scrollTo({ y, animated: true });
      return;
    }
    const a = anchor.current;
    const top = a ? offsets.current.get(a.day) : undefined;
    if (a && top !== undefined) {
      const want = top + a.delta;
      if (Math.abs(scrollY.current - want) > 1) {
        scrollY.current = want;
        handle.scrollTo({ y: want, animated: false });
      }
    }
    if (!placed.current) {
      placed.current = true;
      setReady(true);
    }
  }, [targetIso, jumping, status, finishMove]);

  // A target arriving (or its read landing) is a layout event of its own: the headers may already be measured.
  React.useEffect(() => {
    reconcile();
  }, [reconcile, days]);

  // The list ends with filler so its last day can stand at the top, never shorter than rule 18's clearance.
  const bottomHeight = React.useRef(0);
  const measureFiller = React.useCallback(() => {
    const last = days.length ? iso(days[days.length - 1]) : null;
    const below = (last ? heights.current.get(last) ?? 0 : 0) + bottomHeight.current;
    setFiller(Math.max(FAB_CLEARANCE, viewport.current - below));
  }, [days]);

  const report = (y: number) => {
    scrollY.current = y;
    list.scrolledTo({ days: positions(), offset: y + 1, touched: touched.current });
    const here = positions().filter((p) => p.top <= y + 1);
    const at = here[here.length - 1];
    // The place the reader is at, for a later layout pass to keep; not while the list is moving to a target.
    if (at && !targetIso) anchor.current = { day: at.date, delta: y - at.top };
  };

  if (days.length === 0) {
    return status === "error" ? (
      <View testID="calendar-day-list" className="flex-1 items-center gap-3 px-5 py-10">
        <Text testID="calendar-day-error" className="text-center text-muted-foreground">
          {t("calendar.mobile.loadFailed")}
        </Text>
        <RetryButton testID="calendar-day-retry" onPress={list.retry} label={t("calendar.mobile.retry")} />
      </View>
    ) : (
      <View testID="calendar-day-list" className="flex-1 gap-3 p-4">
        <SkeletonRows testID="calendar-day-loading" />
      </View>
    );
  }

  // The ScrollView's children, flat, so the headers' indices are known.
  const children: React.ReactNode[] = [];
  const sticky: number[] = [];
  if (status === "error") {
    // A read that failed while earlier days are on screen (a jump outside the range): say why (26b, 26d).
    children.push(
      <View key="error" className="items-center gap-3 px-5 py-4">
        <Text testID="calendar-day-error" className="text-center text-muted-foreground">
          {t("calendar.mobile.loadFailed")}
        </Text>
        <RetryButton testID="calendar-day-retry" onPress={list.retry} label={t("calendar.mobile.retry")} />
      </View>
    );
  }
  if (list.edges) {
    const before = list.edges.before;
    children.push(
      <EdgeRow key="before" testID="calendar-day-edge-before" onPress={() => list.goTo(before)}>
        {t("calendar.mobile.weeksBefore")}
      </EdgeRow>
    );
  }
  for (const day of days) {
    const key = iso(day);
    const dayEvents = eventsByDay[key] ?? [];
    sticky.push(children.length);
    children.push(
      <View
        key={`h-${key}`}
        testID={`calendar-day-header-${key}`}
        className="bg-background"
        onLayout={(e: LayoutEvent) => {
          offsets.current.set(key, e.nativeEvent.layout.y);
          heights.current.set(key, e.nativeEvent.layout.height);
          reconcile();
        }}
      >
        <DayHeader day={day} count={dayEvents.length} empty={dayEvents.length === 0} />
      </View>
    );
    if (dayEvents.length > 0) {
      children.push(
        <View
          key={`c-${key}`}
          testID={`calendar-day-section-${key}`}
          className="gap-3 px-5 pb-4 pt-1"
          onLayout={(e: LayoutEvent) => {
            heights.current.set(key, e.nativeEvent.layout.height + (heights.current.get(`h-${key}`) ?? 0));
          }}
        >
          {dayEvents.map((event) => (
            <EventCard
              key={String(event.id)}
              event={event}
              onPress={onEventPress}
              isNext={event.id === nextEventId}
              levelCode={event.levelId !== undefined ? levelCodeById.get(String(event.levelId)) : undefined}
            />
          ))}
        </View>
      );
    } else {
      children.push(<View key={`c-${key}`} className="pb-2" />);
    }
  }
  children.push(
    <View
      key="bottom"
      onLayout={(e: LayoutEvent) => {
        bottomHeight.current = e.nativeEvent.layout.height;
        measureFiller();
      }}
    >
      {list.tail === "loading" ? (
        <SkeletonRows testID="calendar-day-tail-loading" />
      ) : list.tail === "error" ? (
        <View testID="calendar-day-tail-error" className="items-center gap-2 px-5 py-4">
          <Text className="text-center text-sm text-muted-foreground">{t("calendar.mobile.loadMoreFailed")}</Text>
          <RetryButton testID="calendar-day-tail-retry" onPress={list.retryTail} label={t("calendar.mobile.retry")} />
        </View>
      ) : (
        list.edges && (
          <EdgeRow testID="calendar-day-edge-after" onPress={() => list.goTo(list.edges!.after)}>
            {t("calendar.mobile.weeksAfter")}
          </EdgeRow>
        )
      )}
    </View>
  );
  children.push(<View key="filler" testID="calendar-day-filler" style={{ height: filler }} />);

  return (
    <>
      <ScrollView
        ref={(node: unknown) => {
          scroller.current = node as ScrollHandle | null;
        }}
        testID="calendar-day-list"
        className="flex-1"
        style={{ opacity: ready ? 1 : 0 }}
        stickyHeaderIndices={sticky}
        scrollEventThrottle={16}
        refreshControl={refreshControl}
        onLayout={(e: LayoutEvent) => {
          viewport.current = e.nativeEvent.layout.height;
          measureFiller();
        }}
        onContentSizeChange={() => {
          contentReady.current = true;
          reconcile();
        }}
        onScroll={(e: ScrollEvent) => report(e.nativeEvent.contentOffset.y)}
        // A touch ends a movement at once (26b); the list then reports where it stands.
        onScrollBeginDrag={() => {
          touched.current = true;
          if (moving.current) {
            clearTimeout(moving.current);
            moving.current = null;
          }
          report(scrollY.current);
        }}
        onMomentumScrollEnd={(e: ScrollEvent) => {
          // The end of a programmatic animation arrives here too: that is the target's arrival.
          if (targetIso && moving.current) finishMove(targetIso);
          report(e.nativeEvent.contentOffset.y);
        }}
      >
        {children}
      </ScrollView>
      {!isClubToday(selectedDay) && (
        <Pressable
          testID="calendar-day-today"
          accessibilityLabel={t("calendar.toolbar.today")}
          role="button"
          onPress={onToday}
          style={{ bottom: todayBottom }}
          className="absolute left-4 h-11 items-center justify-center rounded-full border border-border bg-card px-5 shadow-lg active:opacity-90"
        >
          <Text className="text-sm font-sans-bold text-foreground">{t("calendar.toolbar.today")}</Text>
        </Pressable>
      )}
    </>
  );
}

function EdgeRow({ testID, onPress, children }: { testID: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable testID={testID} role="button" onPress={onPress} className="h-11 items-center justify-center px-5">
      <Text className="text-sm font-sans-bold text-primary">{children}</Text>
    </Pressable>
  );
}

function RetryButton({ testID, onPress, label }: { testID: string; onPress: () => void; label: string }) {
  return (
    <Pressable
      testID={testID}
      role="button"
      onPress={onPress}
      className="h-11 items-center justify-center rounded-md border border-border px-4"
    >
      <Text className="text-sm font-sans-bold text-foreground">{label}</Text>
    </Pressable>
  );
}

function SkeletonRows({ testID }: { testID: string }) {
  return (
    <View testID={testID} className="gap-3 px-5 py-4">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </View>
  );
}
