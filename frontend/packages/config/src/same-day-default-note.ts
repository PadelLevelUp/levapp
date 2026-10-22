/**
 * PAD-685 — notifications.config rule 6e: "do not invite a student who already has a class that
 * day" now comes on by default, so both clients show, once, a dismissible note above its toggle.
 * The pure half: the device-storage key and when the note shows. Dismissal is remembered on the
 * device only; nothing is sent to the server.
 */
export const SAME_DAY_DEFAULT_NOTE_STORAGE_KEY = "levapp.sameDayDefaultNote.dismissed";
export const SAME_DAY_DEFAULT_NOTE_DISMISSED = "1";

/** The note shows until the stored value says it was dismissed; a missing or odd value shows it. */
export function sameDayDefaultNoteShown(dismissedValue: string | null | undefined): boolean {
  return dismissedValue !== SAME_DAY_DEFAULT_NOTE_DISMISSED;
}
