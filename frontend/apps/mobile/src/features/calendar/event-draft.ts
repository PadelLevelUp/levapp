/**
 * Calendar-block (non-class event) draft mapping (PAD-160).
 *
 * Mirrors the two conversions web's `EventDetailSheet` does inline: turning a
 * fetched block into an editable draft, and turning that draft back into the
 * `editCalendarBlock` payload. Kept here as pure functions so the mobile unit
 * runner can pin them — the screen itself is Maestro's job.
 */

export type BlockType = "personal" | "break" | "holiday" | "off_work";

export const BLOCK_TYPES: BlockType[] = [
  "personal",
  "break",
  "holiday",
  "off_work",
];

export type EventDraft = {
  type: BlockType;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  selectedDays: number[];
  endDate: string;
};

/** The block shape the API returns; every field is optional in practice. */
export type CalendarBlockLike = {
  type?: string | null;
  title?: string | null;
  description?: string | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  isRecurring?: boolean | null;
  recurrenceRule?: { daysOfWeek?: number[] | null } | null;
  recurrenceEnd?: string | null;
};

/** Date/time to fall back on when the block omits them — the calendar event. */
export type DraftFallback = {
  date: string;
  startTime: string;
  endTime: string;
};

function isBlockType(value: unknown): value is BlockType {
  return BLOCK_TYPES.includes(value as BlockType);
}

/**
 * Build an editable draft from a fetched block.
 *
 * The block is the source of truth, but a recurring occurrence carries the
 * SERIES date/times, so the tapped occurrence's values are passed in as the
 * fallback — same precedence web uses.
 */
export function blockToDraft(
  block: CalendarBlockLike | null | undefined,
  fallback: DraftFallback
): EventDraft {
  return {
    // An unrecognised type would put the Select in an unselectable state, so
    // it degrades to the default rather than being passed through.
    type: isBlockType(block?.type) ? block.type : "personal",
    title: block?.title ?? "",
    description: block?.description ?? "",
    date: block?.date ?? fallback.date,
    startTime: block?.startTime ?? fallback.startTime,
    endTime: block?.endTime ?? fallback.endTime,
    isRecurring: block?.isRecurring ?? false,
    selectedDays: block?.recurrenceRule?.daysOfWeek ?? [],
    endDate: block?.recurrenceEnd ?? "",
  };
}

/**
 * Build the `editCalendarBlock` payload from a draft.
 *
 * Empty strings become `null` so clearing a title actually clears it server
 * side instead of storing "". Recurrence fields are nulled out whenever the
 * event is not recurring, so turning recurrence off does not leave a stale
 * rule or end date behind.
 */
export function draftToPayload(draft: EventDraft): Record<string, unknown> {
  return {
    type: draft.type,
    title: draft.title || null,
    description: draft.description || null,
    date: draft.date,
    startTime: draft.startTime,
    endTime: draft.endTime,
    isRecurring: draft.isRecurring,
    recurrenceRule: draft.isRecurring
      ? { frequency: "weekly", daysOfWeek: draft.selectedDays }
      : null,
    endDate: draft.isRecurring ? draft.endDate || null : null,
  };
}
