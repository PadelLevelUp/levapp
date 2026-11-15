/**
 * PAD-837 (attendance.validation rule 17d, Q3 decided 2026-11-15): minutes as hours, once for both
 * shells and both CSVs. From one hour up: whole hours, "h", then the minutes in two digits when
 * they are not zero (90 → "1h30", 120 → "2h"). Under one hour: the minutes and "min", no space
 * (45 → "45min", never "0h45", the owner's correction). Zero is "0min" (the lead's reading). The
 * same text in pt and en; never a decimal.
 * The server sends whole minutes; nothing here rounds anything but a stray fraction.
 */

/** U+2212, the minus sign: the balance's negative reads as a sign, not a hyphen. */
export const MINUS_SIGN = "−";

export function formatMinutesAsHours(minutes: number): string {
  const whole = Math.trunc(minutes);
  const abs = Math.abs(whole);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  const text =
    hours === 0 ? `${rest}min` : rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`;
  return whole < 0 ? `${MINUS_SIGN}${text}` : text;
}

/** Which side of zero a balance is on; a colour may follow it, never carry it alone. */
export type BalanceSign = "positive" | "negative" | "zero";

export function balanceSign(minutes: number): BalanceSign {
  const whole = Math.trunc(minutes);
  return whole > 0 ? "positive" : whole < 0 ? "negative" : "zero";
}

/** "Saldo de horas": the sign always written first ("+1h30", "−45min"), "0min" for zero. */
export function formatBalanceHours(minutes: number): string {
  const sign = balanceSign(minutes);
  if (sign === "zero") return formatMinutesAsHours(0);
  const text = formatMinutesAsHours(Math.abs(Math.trunc(minutes)));
  return sign === "positive" ? `+${text}` : `${MINUS_SIGN}${text}`;
}
