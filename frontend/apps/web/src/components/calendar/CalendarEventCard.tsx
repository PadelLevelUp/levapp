import { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { CalendarEvent } from '@/types';
import {
  contrastTextOn,
  fadeColor,
  hasOpenSpots,
  readableInk,
  resolveEventState,
  type EventVisualState,
} from '@levelup/config';
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
        stateStyle.border = `1px solid ${hex}`;
        // Title, time, count and the fill bar all take the class's own colour
        // — the bar draws in currentColor, so it follows for free. Blended to
        // stay readable on the card; the raw hex would fail on the pale hues.
        stateStyle.color = readableInk(hex);
        onColor = false;
        break;
      case 'past':
        stateStyle.backgroundColor = fadeColor(hex);
        stateStyle.color = 'hsl(var(--muted-foreground))';
        // 22% of a pale hue over a white card is ~1.06:1 against the grid, so
        // the block disappeared rather than receding. A border gives it an
        // edge without making it compete with live classes again.
        stateStyle.border = '1px solid hsl(var(--border))';
        onColor = false;
        break;
      default:
        stateStyle.backgroundColor = hex;
        stateStyle.color = contrastTextOn(hex);
        onColor = contrastTextOn(hex) === '#FFFFFF';
    }
  }

  // PAD-130 (eligibility.open-spot-visibility rules 2, 11): an offer, not a
  // commitment — the class's colour as a dashed outline on a plain surface.
  const isOpenSpot = !!event.openSpot;
  if (isOpenSpot) {
    stateStyle.backgroundColor = 'hsl(var(--card))';
    stateStyle.border = `1.5px dashed ${hex ?? 'hsl(var(--primary))'}`;
    stateStyle.color = hex ? readableInk(hex) : 'hsl(var(--foreground))';
    onColor = false;
  }

  const capacity = event.maxPlayers ?? 0;
  const filled = event.participantCount ?? 0;
  const confirmed = event.confirmedCount ?? 0;
  const showFill = !isBlock && capacity > 0;

  // PAD-148 / R-026. The card carries a click handler, so it has to be a real
  // control — focusable, named, Enter/Space-activatable, with a focus ring.
  //
  // It stays a <div role="button"> rather than becoming a native <button> for
  // two independent reasons: this same element is the HTML5 drag source for
  // calendar.drag-drop, and its subtree holds <div>s and a role="progressbar"
  // fill bar, neither of which a <button> may legally contain.
  //
  // A card with no onClick (a calendar block, or a read-only render) is not a
  // control and must not be announced as one — the same gate iOS applies via
  // `accessibilityState.disabled` in EventCard.tsx.
  const interactive = Boolean(onClick);
  const title = event.title || t('calendar.eventCard.fallbackTitle');
  // Title AND time range: a week grid holds several classes, and the title
  // alone does not say which slot the focused one is.
  const ariaLabel = t('calendar.eventCard.openAria', {
    title,
    start: event.startTime,
    end: event.endTime,
  });

  return (
    <div
      style={{ ...style, ...stateStyle }}
      data-testid="calendar-event-card"
      data-event-state={state}
      data-needs-players={needsPlayers ? 'true' : 'false'}
      data-open-spot={isOpenSpot ? 'true' : 'false'}
      draggable
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? ariaLabel : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                // Without preventDefault, Space scrolls the grid instead.
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      onDragStart={(e) => { e.stopPropagation(); onDragStart?.(); }}
      onDragEnd={onDragEnd}
      className={cn(
        'flex flex-col rounded-lg cursor-grab active:cursor-grabbing transition-all hover:brightness-95 overflow-hidden',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isRow ? 'gap-1 px-3 py-2.5 rounded-xl' : 'gap-0.5 px-2 py-1.5',
        typeClass(),
        isBlock && 'border border-dashed',
        isCanceled && 'opacity-50 line-through',
        !isBlock && !hex && 'text-white',
        state === 'next' && 'shadow-md',
      )}
    >
      {/* Title + level chip. The chip is the only thing allowed on the right,
          so the eye can scan a column of levels. */}
      <div className="flex items-start justify-between gap-1">
        <p className={cn('font-semibold leading-tight truncate', isRow ? 'text-sm' : 'text-xs', isBlock && 'text-muted-foreground')}>
          {isOpenSpot && (
            <span
              data-testid="calendar-open-spot-chip"
              className="mb-0.5 inline-block rounded-full border border-current px-1.5 text-[10px] font-semibold uppercase tracking-wide"
            >
              {t('calendar.openSpot.chip')}
            </span>
          )}
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

      {/* clubs.courts rule 7 (PAD-194): where the class happens. */}
      {!isBlock && event.club && (!compact || isRow) && (
        <p
          data-testid="calendar-event-place"
          className={cn('truncate opacity-80 leading-tight', isRow ? 'text-xs' : 'text-[10px]')}
        >
          {event.court ? `${event.club.name} · ${event.court.name}` : event.club.name}
        </p>
      )}

      {/* Fill: the bar reads before the number does. */}
      {showFill && (!compact || isRow) && (
        <div className="mt-auto flex items-center gap-1.5">
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
