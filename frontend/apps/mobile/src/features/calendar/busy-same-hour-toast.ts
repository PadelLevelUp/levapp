/**
 * PAD-920 (classes.instance-enrollment rule 15): a coach's add (the class edit, or accepting a join
 * request) that would put a student in two classes at the same hour answers `409 busy_same_hour`.
 * The screen says who and where in ONE toast: the toast store shows only 3 at a time, so a toast per
 * clash would drop every clash past the third. The first clash is the title, the rest the description.
 */
import { busySameHourClashes, busySameHourLines, type I18nText } from "@levelup/config";

export function busySameHourToast(
  err: unknown,
  language: string | undefined
): { title: I18nText; description: I18nText[] } | null {
  const clashes = busySameHourClashes(err);
  if (!clashes || clashes.length === 0) return null;
  const [title, ...description] = busySameHourLines(clashes, language);
  return { title, description };
}

/** Shows the refusal as one error toast; `t` is the screen's translator. */
export function showBusySameHourToast(
  shown: { title: I18nText; description: I18nText[] },
  t: (key: string, params?: I18nText["params"]) => string,
  error: (title: string, description?: string) => unknown
): void {
  const description = shown.description.map((line) => t(line.key, line.params)).join("\n");
  error(t(shown.title.key, shown.title.params), description || undefined);
}
