import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import type { useDayList } from "@levelup/hooks";
import type { CalendarEvent } from "@levelup/types";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { DayHeader } from "./DayHeader";
import { FAB_CLEARANCE_PX } from "./layout";
import { MobileEventCard } from "./MobileEventCard";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Rule 26b: a movement inside the loaded range lasts one second at most. */
const MOVE_LIMIT_MS = 1000;
/** Without `scrollend`, the movement is over once the list has been still this long. */
const STILL_MS = 120;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function setScrollTop(el: HTMLElement, top: number, smooth: boolean) {
  if (typeof el.scrollTo === "function") el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  else el.scrollTop = top;
}

/**
 * Dia's one list of days — calendar.mobile-views rule 26 (web phone).
 *
 * Each day is rule 3's block: a header that stays at the list's top while its cards scroll, then its cards (an
 * empty day is its header with rule 4's line). The state — what is loaded, which day is selected while the list
 * scrolls, the target a date / chevron / Hoje / link sets — is `useDayList`'s; this draws it and reports where
 * the list is. Test ids are 26g's: `calendar-day-list`, `calendar-day-section-{yyyy-MM-dd}`.
 */
export function DayList({
  list,
  eventsByDay,
  nextEventId,
  levelCodeById,
  onEventClick,
}: {
  list: ReturnType<typeof useDayList>;
  /** The loaded days' events (the student's filter already applied), each day in start-time order. */
  eventsByDay: Record<string, CalendarEvent[]>;
  nextEventId?: string;
  levelCodeById: Map<string, string>;
  onEventClick?: (event: CalendarEvent) => void;
}) {
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);
  const sections = useRef(new Map<string, HTMLElement>());
  const bottom = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const standing = useRef(false);
  const moving = useRef(false);
  const anchor = useRef<{ day: string; delta: number } | null>(null);
  const [filler, setFiller] = useState(FAB_CLEARANCE_PX);

  const { days, status, target, jumping } = list;
  const targetIso = target ? iso(target) : null;

  // Where the list is: the day whose section holds its top, as `useDayList` decides which day that selects.
  const report = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const positions = days.flatMap((d) => {
      const s = sections.current.get(iso(d));
      return s ? [{ date: iso(d), top: s.offsetTop }] : [];
    });
    list.scrolledTo({ days: positions, offset: el.scrollTop + 1, touched: touched.current });
    // The place inside the day being read, for a refresh to keep (rule 26g).
    let at = positions[0];
    for (const p of positions) if (p.top <= el.scrollTop + 1) at = p;
    if (at) anchor.current = { day: at.date, delta: el.scrollTop - at.top };
  }, [days, list]);

  // A touch or the wheel ends a movement at once (26b): the animation is cancelled where the list stands (a browser
  // does not always do that for its own smooth scroll) and the list reports, so the day at the top is the selection.
  const markTouched = useCallback(() => {
    touched.current = true;
    const el = scroller.current;
    if (el && moving.current) {
      moving.current = false;
      setScrollTop(el, el.scrollTop, false);
      report();
    }
  }, [report]);

  // Moving the list to the target (26b): jump with reduced motion and the first time; otherwise a movement that
  // ends at `scrollend` where the browser has it, and when the list has been still for a moment where it has not.
  useEffect(() => {
    const el = scroller.current;
    if (!targetIso || !el || jumping || status !== "ready") return;
    const section = sections.current.get(targetIso);
    if (!section) return;
    touched.current = false;
    const finish = () => {
      moving.current = false;
      standing.current = true;
      // The place a refresh keeps is now the target's top.
      anchor.current = { day: targetIso, delta: 0 };
      list.settled();
    };
    const top = section.offsetTop;
    if (prefersReducedMotion() || !standing.current) {
      setScrollTop(el, top, false);
      finish();
      return;
    }
    moving.current = true;
    setScrollTop(el, top, true);
    const timers: ReturnType<typeof setTimeout>[] = [setTimeout(finish, MOVE_LIMIT_MS)];
    let off: () => void;
    // Not every browser has `scrollend` (older Safari): the property's presence says which path this is.
    const hasScrollEnd = (el as { onscrollend?: unknown }).onscrollend !== undefined;
    if (hasScrollEnd) {
      el.addEventListener("scrollend", finish, { once: true });
      off = () => el.removeEventListener("scrollend", finish);
    } else {
      let still = setTimeout(finish, STILL_MS);
      const onScroll = () => {
        clearTimeout(still);
        still = setTimeout(finish, STILL_MS);
      };
      el.addEventListener("scroll", onScroll);
      off = () => {
        clearTimeout(still);
        el.removeEventListener("scroll", onScroll);
      };
    }
    return () => {
      moving.current = false;
      off();
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIso, jumping, status]);

  // A refresh keeps the place inside the day being read (26g): the section the reader was in may have moved.
  // Only a change of the days' content does this; a movement to a target (and the end of one) is not a refresh.
  const movingTo = useRef<string | null>(null);
  movingTo.current = targetIso;
  useLayoutEffect(() => {
    const el = scroller.current;
    const a = anchor.current;
    if (!el || !a || movingTo.current) return;
    const section = sections.current.get(a.day);
    if (!section) return;
    const want = section.offsetTop + a.delta;
    if (Math.abs(el.scrollTop - want) > 1) el.scrollTop = want;
  }, [eventsByDay]);

  // The list ends with filler so its last day can stand at the top, never shorter than rule 18's clearance.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || days.length === 0) return;
    const measure = () => {
      const last = sections.current.get(iso(days[days.length - 1]));
      const below = (last?.offsetHeight ?? 0) + (bottom.current?.offsetHeight ?? 0);
      setFiller(Math.max(FAB_CLEARANCE_PX, el.clientHeight - below));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [days, eventsByDay]);

  if (days.length === 0) {
    return (
      <div data-testid="calendar-day-list" className="min-h-0 flex-1 overflow-y-auto">
        {status === "error" ? (
          <div data-testid="calendar-day-error" className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <p className="text-muted-foreground">{t("calendar.mobile.loadFailed")}</p>
            <button
              type="button"
              data-testid="calendar-day-retry"
              onClick={list.retry}
              className="h-11 rounded-md border border-border px-4 text-sm font-medium"
            >
              {t("calendar.mobile.retry")}
            </button>
          </div>
        ) : (
          <SkeletonRows testId="calendar-day-loading" />
        )}
      </div>
    );
  }

  return (
    <div
      ref={scroller}
      data-testid="calendar-day-list"
      className="relative min-h-0 flex-1 overflow-y-auto"
      onScroll={report}
      onWheel={markTouched}
      onTouchStart={markTouched}
      onPointerDown={markTouched}
    >
      {status === "error" && (
        // A read that failed while earlier days are on screen (a jump outside the range): say why (26b, 26d).
        <div data-testid="calendar-day-error" className="flex flex-col items-center gap-3 px-5 py-4 text-center">
          <p className="text-muted-foreground">{t("calendar.mobile.loadFailed")}</p>
          <button
            type="button"
            data-testid="calendar-day-retry"
            onClick={list.retry}
            className="h-11 rounded-md border border-border px-4 text-sm font-medium"
          >
            {t("calendar.mobile.retry")}
          </button>
        </div>
      )}
      {list.edges && (
        <EdgeRow testId="calendar-day-edge-before" onClick={() => list.goTo(list.edges!.before)}>
          {t("calendar.mobile.weeksBefore")}
        </EdgeRow>
      )}
      {days.map((day) => {
        const key = iso(day);
        const dayEvents = eventsByDay[key] ?? [];
        return (
          <section
            key={key}
            ref={(node) => {
              if (node) sections.current.set(key, node);
              else sections.current.delete(key);
            }}
            data-testid={`calendar-day-section-${key}`}
          >
            <div data-testid={`calendar-day-header-${key}`} className="sticky top-0 z-10 bg-background">
              <DayHeader day={day} count={dayEvents.length} empty={dayEvents.length === 0} />
            </div>
            {dayEvents.length === 0 ? (
              <div className="pb-2" />
            ) : (
              <div className="flex flex-col gap-3 px-5 pb-4 pt-1">
                {dayEvents.map((event) => (
                  <MobileEventCard
                    key={String(event.id)}
                    event={event}
                    isNext={event.id === nextEventId}
                    levelCode={
                      event.levelId !== undefined ? levelCodeById.get(String(event.levelId)) : undefined
                    }
                    onClick={onEventClick}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
      <div ref={bottom}>
        {list.tail === "loading" ? (
          <SkeletonRows testId="calendar-day-tail-loading" />
        ) : list.tail === "error" ? (
          <div data-testid="calendar-day-tail-error" className="flex flex-col items-center gap-2 px-5 py-4 text-center">
            <p className="text-sm text-muted-foreground">{t("calendar.mobile.loadMoreFailed")}</p>
            <button
              type="button"
              data-testid="calendar-day-tail-retry"
              onClick={list.retryTail}
              className="h-11 rounded-md border border-border px-4 text-sm font-medium"
            >
              {t("calendar.mobile.retry")}
            </button>
          </div>
        ) : (
          list.edges && (
            <EdgeRow testId="calendar-day-edge-after" onClick={() => list.goTo(list.edges!.after)}>
              {t("calendar.mobile.weeksAfter")}
            </EdgeRow>
          )
        )}
      </div>
      <div data-testid="calendar-day-filler" style={{ height: filler }} />
    </div>
  );
}

function EdgeRow({ testId, onClick, children }: { testId: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="block h-11 w-full px-5 text-center text-sm font-medium text-primary"
    >
      {children}
    </button>
  );
}

function SkeletonRows({ testId }: { testId: string }) {
  return (
    <div data-testid={testId} className="flex flex-col gap-3 px-5 py-4" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <LoadingSkeleton key={i} className="h-20 w-full" variant="pulse" />
      ))}
    </div>
  );
}
