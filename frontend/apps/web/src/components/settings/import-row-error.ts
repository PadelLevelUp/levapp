import type { TFunction } from "i18next";
import type { ImportRowError } from "@/api/import";

export type { ImportRowError };

/**
 * D111 (PAD-403, evaluations.legacy-conversion): a coded error renders from
 * `settings.import.rowErrors.<code>`, and the server's English text is the
 * fallback for a code this build does not know. An uncoded error shows as sent.
 */
export function importRowErrorText(t: TFunction, { error, code, category, value }: ImportRowError): string {
  if (!code) return error;
  return t(`settings.import.rowErrors.${code}`, { category, value, defaultValue: error });
}
