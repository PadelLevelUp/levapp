import { CSSProperties } from 'react';
import { Check } from 'lucide-react';
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
import { ClassFillBar } from './ClassFillBar';

interface CalendarEventCardProps {
  event: CalendarEvent;
  style?: CSSProperties;
  onClick?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** True for the soonest upcoming class in the visible set. */
  isNext?: boolean;
  /** Level code for the chip, e.g. "N3" — resolved from the coach's levels. */
  levelCode?: string;
  /** Below this height the block only has room for its title line. */
  compact?: boolean;
  /**
   * "block" is the week grid, where space is scarce and type is tiny.
   * "row" is the mobile day list, which is full width and was inheriting the
   * grid's 10px scale — that is what made the phone view look cramped.
   */
  variant?: 'block' | 'row';
}

export function CalendarEventCard({
  event,
  style,
  onClick,
  onDragStart,
  onDragEnd,
  isNext = false,
  levelCode,
  compact = false,
  variant = 'block',
}: CalendarEventCardProps) {
  const isRow = variant === 'row';
  const { t } = useTranslation();
  const state: EventVisualState = resolveEventState(event, { isNext });
  const isBlock = state === 'block';
  const isCanceled = state === 'canceled';
  const isPast = state === 'past';
  const isCompleted = event.status === 'completed';
  const needsPlayers = !isPast && !isCanceled && hasOpenSpots(event);

  const hex = !isBlock ? event.color : undefined;

  const typeClass = () => {
    if (isBlock) return 'bg-muted border-muted-foreground/20';
    if (hex) return '';
    return event.classType === 'academy' ? 'bg-academy' : 'bg-private';
  };

  // Colour identifies the class; STYLE reports its state.
  const stateStyle: CSSProperties = {};
  // Whether the content sits on a saturated fill (→ draw in white) or on a
  // light surface (→ draw in ink).
  let onColor = !isBlock && !hex; // token backgrounds are dark enough for white

  if (hex) {
    switch (state) {
      case 'next':
        stateStyle.backgroundColor = 'hsl(var(--card))';
        stateStyle.border = `2px solid ${hex}`;
        stateStyle.color = 'hsl(var(--foreground))';
        onColor = false;
        break;
      case 'past':
        stateStyle.backgroundColor = fadeColor(hex);
        stateStyle.color = 'hsl(var(--muted-foreground))';
        onColor = false;
        break;
      default:
        stateStyle.backgroundColor = hex;
        stateStyle.color = contrastTextOn(hex);
        onColor = contrastTextOn(hex) === '#FFFFFF';
    }
  }

  const capacity = event.maxPlayers ?? 0;
  const filled = event.participantCount ?? 0;
  const confirmed = event.confirmedCount ?? 0;
  const showFill = !isBlock && capacity > 0;

  return (
    <div
      style={{ ...style, ...stateStyle }}
      data-testid="calendar-event-card"
      data-event-state={state}
      data-needs-players={needsPlayers ? 'true' : 'false'}
      draggable
      onClick={onClick}
      onDragStart={(e) => { e.stopPropagation(); onDragStart?.(); }}
      onDragEnd={onDragEnd}
      className={cn(
        'flex flex-col rounded-lg cursor-grab active:cursor-grabbing transition-all hover:brightness-95 overflow-hidden',
        isRow ? 'gap-1 px-3 py-2.5 rounded-xl' : 'gap-0.5 px-2 py-1.5',
        typeClass(),
        isBlock && 'border border-dashed',
        isCanceled && 'opacity-50 line-through',
        !isBlock && !hex && 'text-white',
        state === 'next' && 'shadow-md',
        needsPlayers && 'ring-2 ring-warning ring-offset-2 ring-offset-background',
      )}
    >
      {/* Title + level chip. The chip is the only thing allowed on the right,
          so the eye can scan a column of levels. */}
      <div className="flex items-start justify-between gap-1">
        <p className={cn('font-semibold leading-tight truncate', isRow ? 'text-sm' : 'text-xs', isBlock && 'text-muted-foreground')}>
          {event.title}
        </p>
        {levelCode && !isBlock && (
          <span
            className={cn(
              'shrink-0 rounded font-bold tabular-nums',
              isRow ? 'px-1.5 text-xs leading-5' : 'px-1 text-[10px] leading-4',
              onColor ? 'bg-white/20 text-white' : 'bg-foreground/10'
            )}
          >
            {levelCode}
          </span>
        )}
      </div>

      {!compact && (
        <p className={cn('opacity-80 tabular-nums leading-tight', isRow ? 'text-xs' : 'text-[10px]', isBlock && 'text-muted-foreground')}>
          {event.startTime} – {event.endTime}
        </p>
      )}

      {/* Fill: the bar reads before the number does. */}
      {showFill && (!compact || isRow) && (
        <div className="mt-auto flex items-center gap-1.5 pt-1">
          <ClassFillBar
            confirmed={confirmed}
            filled={filled}
            capacity={capacity}
            className="flex-1"
          />
          <span className={cn('shrink-0 font-semibold tabular-nums opacity-90', isRow ? 'text-xs' : 'text-[10px]')}>
            {isCompleted && <Check className="mr-0.5 inline h-3 w-3" aria-hidden="true" />}
            {filled}/{capacity}
          </span>
        </div>
      )}

      {isCanceled && (
        <span className="text-[10px]">{t('calendar.eventCard.canceled')}</span>
      )}
    </div>
  );
}
