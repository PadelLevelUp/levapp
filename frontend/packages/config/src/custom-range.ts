/**
 * Whether a custom period is submittable (attendance.history rules 11/12).
 *
 * Both ends are required and `from` must not be after `to`. String comparison
 * is exact for zero-padded `YYYY-MM-DD`, so no Date is constructed. Web's range
 * controls and iOS's range sheet both call this one check (PAD-855).
 */
export function isValidCustomRange(from: string, to: string): boolean {
  return Boolean(from) && Boolean(to) && from <= to;
}
