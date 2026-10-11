/**
 * PAD-559 (classes.create rule 8c): the pure half of the iOS time picker — typed-entry parsing
 * and the end guard — kept free of React Native imports so the unit runner can load it.
 */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));

/** "9", "930", "9:30", "9h30", "21.15" → "09:30" (etc.); anything else → null. */
export function parseTypedTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/[h.]/g, ":");
  let h: number;
  let min: number;
  const colon = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (colon) [h, min] = [Number(colon[1]), Number(colon[2])];
  else if (/^\d{1,2}$/.test(t)) [h, min] = [Number(t), 0];
  else if (/^\d{3,4}$/.test(t)) [h, min] = [Number(t.slice(0, -2)), Number(t.slice(-2))];
  else return null;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * An end at or before `from` is refused in the field — it snaps to `from` plus the usual length
 * (never past 23:59) — and the caller is told.
 */
export function guardEnd(
  value: string,
  from: string | undefined,
  usualMinutes: number | undefined
): { value: string; refused: boolean } {
  if (!from || !TIME_RE.test(from) || !TIME_RE.test(value) || toMin(value) > toMin(from)) {
    return { value, refused: false };
  }
  const total = Math.min(toMin(from) + (usualMinutes ?? 60), 23 * 60 + 59);
  return { value: `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`, refused: true };
}
