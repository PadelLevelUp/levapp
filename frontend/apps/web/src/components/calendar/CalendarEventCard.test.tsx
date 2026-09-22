import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CalendarEvent } from '@/types';
import { CalendarEventCard } from './CalendarEventCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// PAD-372 (classes.class-requests rule 3): the live hold of an open class request cannot
// have one occurrence moved — the server refuses it — so its card is not offered for
// dragging. Every other block keeps the drag.
const block = (extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  model: 'CalendarBlock',
  originalId: 7,
  id: 'block-7-2026-10-15',
  type: 'block',
  blockType: 'personal',
  isRecurring: true,
  title: 'Class request · Bruno',
  date: '2026-10-15',
  startTime: '11:00',
  endTime: '12:00',
  ...extra,
});

describe('CalendarEventCard drag on a class-request hold', () => {
  it('is draggable for an ordinary block', () => {
    render(<CalendarEventCard event={block()} />);
    const card = screen.getByTestId('calendar-event-card');
    expect(card.getAttribute('draggable')).toBe('true');
    expect(card.getAttribute('data-request-hold')).toBe('false');
  });

  it('is not draggable for a live hold', () => {
    render(<CalendarEventCard event={block({ requestHoldOf: 42 })} />);
    const card = screen.getByTestId('calendar-event-card');
    expect(card.getAttribute('draggable')).toBe('false');
    expect(card.getAttribute('data-request-hold')).toBe('true');
  });

  it('treats an explicit null the same as an ordinary block', () => {
    render(<CalendarEventCard event={block({ requestHoldOf: null })} />);
    expect(screen.getByTestId('calendar-event-card').getAttribute('draggable')).toBe('true');
  });
});
