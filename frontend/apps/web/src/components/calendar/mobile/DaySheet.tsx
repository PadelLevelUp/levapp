import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { clampSheetTop, SHEET_HANDLE_HEIGHT, type SheetBounds } from "@levelup/config";
import type { CalendarEvent } from "@/types";
import { DayHeader } from "./DayHeader";
import { FAB_CLEARANCE_PX } from "./layout";
import { MobileEventCard } from "./MobileEventCard";

/**
 * The day sheet over the Semana / Mês grid — calendar.mobile-views rule 3.
 *
 * Absolutely positioned inside the grid container: its top edge is `top` px
 * from the container's top, and a pointer drag on the handle moves it within
 * `bounds` (shared clamp in `calendar-grid.ts`). The drag surface is the handle
 * row and the day header together (PAD-286). Inside: the selected day spelled
 * out, then its cards in a scrolling list.
 */
export function DaySheet({
  top,
  bounds,
  onTopChange,
  day,
  events,
  nextEventId,
  levelCodeById,
  onEventClick,
}: {
  top: number;
  bounds: SheetBounds;
  onTopChange: (top: number) => void;
  day: Date;
  events: CalendarEvent[];
  nextEventId?: string;
  levelCodeById: Map<string, string>;
  onEventClick?: (event: CalendarEvent) => void;
}) {
  const { t } = useTranslation();
  const drag = useRef<{ startY: number; startTop: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { startY: e.clientY, startTop: top };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onTopChange(clampSheetTop(drag.current.startTop + (e.clientY - drag.current.startY), bounds));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      data-testid="calendar-day-sheet"
      data-sheet-top={top}
      data-sheet-min={bounds.min}
      data-sheet-max={bounds.max}
      style={{ top }}
      className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[20px] bg-background shadow-[0_-10px_24px_rgba(11,21,36,0.14)]"
    >
      <div
        data-testid="calendar-sheet-grab"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="shrink-0 cursor-ns-resize touch-none select-none"
      >
        <div
          data-testid="calendar-sheet-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label={t("calendar.sheet.handle")}
          aria-valuenow={top}
          aria-valuemin={bounds.min}
          aria-valuemax={bounds.max}
          style={{ height: SHEET_HANDLE_HEIGHT }}
          className="flex items-center justify-center"
        >
          <span className="h-[5px] w-10 rounded-full bg-primary" />
        </div>
        <DayHeader day={day} count={events.length} />
      </div>
      <div data-testid="calendar-sheet-list" className="min-h-0 flex-1 overflow-y-auto">
        {/* Rule 18: clear of the floating add buttons at the end of the list.
            The padding lives on this inner wrapper, not on the scroller: a
            scroller cannot shrink below its own padding, so padding it would
            push its bottom edge past the sheet and the last card would stop
            under the buttons. */}
        <div className="flex flex-col gap-3 px-5 pt-3" style={{ paddingBottom: FAB_CLEARANCE_PX }}>
        {events.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {t("calendar.mobile.noClassesScheduled")}
          </p>
        ) : (
          events.map((event) => (
            <MobileEventCard
              key={String(event.id)}
              event={event}
              isNext={event.id === nextEventId}
              levelCode={
                event.levelId !== undefined ? levelCodeById.get(String(event.levelId)) : undefined
              }
              onClick={onEventClick}
            />
          ))
        )}
        </div>
      </div>
    </div>
  );
}
