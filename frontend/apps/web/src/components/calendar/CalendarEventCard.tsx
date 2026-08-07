import { CSSProperties } from 'react';
import { Users, XCircle, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { CalendarEvent } from '@/types';
import {
  contrastTextOn,
  fadeColor,
  hasOpenSpots,
  resolveEventState,
  type EventVisualState,
} from '@/lib/calendar-status';

interface CalendarEventCardProps {
  event: CalendarEvent;
  style?: CSSProperties;
  onClick?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** True for the soonest upcoming class in the visible set. */
  isNext?: boolean;
}

export function CalendarEventCard({ event, style, onClick, onDragStart, onDragEnd, isNext = false }: CalendarEventCardProps) {
  const { t } = useTranslation();
  const state: EventVisualState = resolveEventState(event, { isNext });
  const isBlock = state === 'block';
  const isCanceled = state === 'canceled';
  const isCompleted = event.status === 'completed';
  // Seats still to fill — layered on top of the state, never instead of it.
  const needsPlayers = state !== 'past' && state !== 'canceled' && hasOpenSpots(event);

  // The coach's chosen hex. Absent it, class type supplies a token colour and
  // we fall back to the old class-based styling.
  const hex = !isBlock ? event.color : undefined;

  const typeClass = () => {
    if (isBlock) return 'bg-muted border-muted-foreground/20';
    if (hex) return '';
    return event.classType === 'academy' ? 'bg-academy' : 'bg-private';
  };

  /**
   * Colour identifies the class; STYLE reports its state.
   *   next   — white body, the class's colour as its border
   *   past   — the colour drained toward grey
   *   open   — full colour, warning border: seats still to fill
   *   future — full colour
   */
  const stateStyle: CSSProperties = {};
  if (hex) {
    switch (state) {
      case 'next':
        stateStyle.backgroundColor = 'hsl(var(--card))';
        stateStyle.border = `2px solid ${hex}`;
        stateStyle.color = 'hsl(var(--foreground))';
        break;
      case 'past':
        stateStyle.backgroundColor = fadeColor(hex);
        stateStyle.color = 'hsl(var(--muted-foreground))';
        break;
      default:
        stateStyle.backgroundColor = hex;
        stateStyle.color = contrastTextOn(hex);
    }
  }

  return (
    <div
      style={{ ...style, ...stateStyle }}
      data-testid="calendar-event-card"
      data-event-state={state}
      data-needs-players={needsPlayers ? "true" : "false"}
      draggable
      onClick={onClick}
      onDragStart={(e) => { e.stopPropagation(); onDragStart?.(); }}
      onDragEnd={onDragEnd}
      className={cn(
        'rounded-lg px-2 py-1 cursor-grab active:cursor-grabbing transition-all hover:brightness-95 overflow-hidden',
        typeClass(),
        isBlock && 'border border-dashed',
        isCanceled && 'opacity-50 line-through',
        // Without a chosen hex the token background is dark enough for white.
        !isBlock && !hex && 'text-white',
        // The next class is the one thing on the grid allowed to lift off it.
        state === 'next' && 'shadow-md',
        // Amber ring = this one wants the coach. Sits OUTSIDE the border so
        // a next-class-with-holes still shows its own colour.
        needsPlayers && 'ring-2 ring-warning ring-offset-0',
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-xs font-medium truncate',
              isBlock && 'text-muted-foreground'
            )}
          >
            {event.title}
          </p>
          <p
            className={cn(
              'text-[10px] opacity-80 tabular-nums',
              isBlock && 'text-muted-foreground'
            )}
          >
            {event.startTime} - {event.endTime}
          </p>
        </div>

        {!isBlock && event.participantCount !== undefined && (
          <div className="flex items-center gap-0.5 text-[10px] opacity-80 shrink-0 tabular-nums">
            <Users className="w-3 h-3" />
            <span>
              {event.participantCount}/{event.maxPlayers}
            </span>
          </div>
        )}
      </div>

      {isCanceled && (
        <div className="flex items-center gap-1 mt-0.5 text-[10px]">
          <XCircle className="w-3 h-3" />
          <span>{t("calendar.eventCard.canceled")}</span>
        </div>
      )}

      {isCompleted && (
        <div className="flex items-center gap-1 mt-0.5 text-[10px]">
          <Clock className="w-3 h-3" />
          <span>{t("calendar.eventCard.completed")}</span>
        </div>
      )}
    </div>
  );
}
