import { CSSProperties } from 'react';
import { Users, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalendarEvent } from '@/types';

interface CalendarEventCardProps {
  event: CalendarEvent;
  style?: CSSProperties;
  onClick?: () => void;
}

export function CalendarEventCard({ event, style, onClick }: CalendarEventCardProps) {
  const isBlock = event.type === 'block';
  const isCanceled = event.status === 'canceled';
  const isCompleted = event.status === 'completed';

  const getBackgroundColor = () => {
    if (isBlock) {
      return 'bg-muted border-muted-foreground/20';
    }
    if (event.color) {
      return '';
    }
    if (event.classType === 'academy') {
      return 'bg-academy';
    }
    return 'bg-private';
  };

  const customStyle: CSSProperties = {
    ...style,
    backgroundColor: !isBlock && event.color ? event.color : undefined,
  };

  return (
    <div
      style={customStyle}
      onClick={onClick}
      className={cn(
        'rounded-md px-2 py-1 cursor-pointer transition-all hover:opacity-90 hover:shadow-md overflow-hidden',
        getBackgroundColor(),
        isBlock && 'border border-dashed',
        isCanceled && 'opacity-50 line-through',
        !isBlock && 'text-white shadow-sm'
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
              'text-[10px] opacity-80',
              isBlock && 'text-muted-foreground'
            )}
          >
            {event.startTime} - {event.endTime}
          </p>
        </div>

        {!isBlock && event.participantCount !== undefined && (
          <div className="flex items-center gap-0.5 text-[10px] opacity-80 shrink-0">
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
          <span>Canceled</span>
        </div>
      )}

      {isCompleted && (
        <div className="flex items-center gap-1 mt-0.5 text-[10px]">
          <Clock className="w-3 h-3" />
          <span>Completed</span>
        </div>
      )}
    </div>
  );
}
