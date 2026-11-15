import type { TFunction } from "i18next";
import { busySameHourClashes, busySameHourLines, resolveText } from "@levelup/config";

/**
 * PAD-920 (classes.instance-enrollment rule 15): a coach's add refused because the student is in
 * another class at the same hour reads one line per clash, naming that class, in place of the
 * generic failure text. Null for any other failure, so the caller keeps its own words.
 */
export function busySameHourDescription(err: unknown, t: TFunction, language: string | undefined) {
  const clashes = busySameHourClashes(err);
  if (!clashes) return null;
  return (
    <span className="whitespace-pre-line" data-testid="busy-same-hour-lines">
      {busySameHourLines(clashes, language)
        .map((l) => resolveText(t, l))
        .join("\n")}
    </span>
  );
}
