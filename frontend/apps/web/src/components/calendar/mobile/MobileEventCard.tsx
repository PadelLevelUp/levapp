import { useTranslation } from "react-i18next";
import { cardSurfaceWeb, resolveCardVariant } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { cn } from "@/lib/utils";
import { ClassFillBar } from "@/components/calendar/ClassFillBar";

/**
 * A card in the selected day's list — calendar.mobile-views rules 5, 7, 8, 24.
 *
 * The coach's colour is the class's identity and the treatment is its state:
 * solid when scheduled, outlined when it is the next one, faded when done,
 * red when canceled, dashed when it is a block rather than a class. Amber
 * appears on the fill bar and the count only, for a class the coach can
 * still fill. The whole card is one button with a spoken name, so it is
 * reachable by keyboard and by VoiceOver (PAD-148).
 */
export function MobileEventCard({
  event,
  isNext = false,
  levelCode,
  onClick,
  now,
}: {
  event: CalendarEvent;
  isNext?: boolean;
  levelCode?: string;
  onClick?: (event: CalendarEvent) => void;
  now?: Date;
}) {
  const { t } = useTranslation();
  const { variant, seatsShort } = resolveCardVariant(event, { isNext, now });
  const isBlock = variant === "block";
  const isCanceled = variant === "canceled";
  const surface = cardSurfaceWeb(event.color, variant);
  // Text sits on a saturated fill when the surface resolved to white ink.
  const onColor = variant === "scheduled" && surface.color === "#FFFFFF";

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

  return (
    <button
      type="button"
      data-testid="calendar-event-card"
      data-event-state={variant}
      data-needs-players={seatsShort ? "true" : "false"}
      aria-label={`${title}, ${timeRange}`}
      onClick={() => onClick?.(event)}
      style={surface}
      className={cn(
        "flex w-full flex-col rounded-2xl p-4 text-left transition-all hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isBlock && "border-[1.5px] border-dashed border-border bg-card text-foreground",
        variant === "next" && "shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold leading-snug">
          {title}
        </span>
        {levelCode && !isBlock && (
          <span
            className={cn(
              "shrink-0 rounded px-1.5 text-xs font-bold leading-5 tabular-nums",
              onColor ? "bg-white/20" : "bg-foreground/10"
            )}
          >
            {levelCode}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center gap-1.5 text-sm tabular-nums opacity-85">
        <span>{timeRange}</span>
        {event.isRecurring && (
          <span role="img" aria-label={t("calendar.eventCard.recurring")}>
            ↻
          </span>
        )}
      </div>

      {subtitle && <span className="mt-1 text-sm opacity-85">{subtitle}</span>}

      {showFill && (
        <div className="mt-3.5 flex items-center gap-2.5">
          <ClassFillBar
            confirmed={confirmed}
            filled={filled}
            capacity={capacity}
            tone={seatsShort ? "warning" : "current"}
            className="flex-1"
          />
          <span
            className={cn(
              "shrink-0 text-[13px] font-bold tabular-nums",
              seatsShort && (onColor ? "text-warning" : "text-warning-strong")
            )}
          >
            {filled}/{capacity}
          </span>
        </div>
      )}
    </button>
  );
}
