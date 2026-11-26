import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { useClassCancellations } from "@levelup/hooks";

import { Separator } from "@/components/ui/separator";
import { dateFnsLocale } from "@/lib/dateLocale";

/**
 * classes.delete rule 14 (PAD-840): the class's cancellations that had a reason, newest date first. The
 * coach's only; a class with none shows nothing.
 */
export function ClassCancellationsSection({ lessonId, enabled }: { lessonId?: string; enabled: boolean }) {
  const { t, i18n } = useTranslation();
  const { data } = useClassCancellations(lessonId, enabled);
  if (!enabled || !data?.length) return null;
  return (
    <>
      <Separator />
      <section className="space-y-2" data-testid="class-cancellations">
        <h3 className="text-sm font-medium">{t("calendar.cancellations.title")}</h3>
        {data.map((c) => (
          <div key={`${c.date}-${c.scope}-${c.reason}`} className="text-sm" data-testid="class-cancellation-row">
            <p className="font-medium">
              {format(parseISO(c.date), "EEE, d MMM", { locale: dateFnsLocale(i18n.language) })}
              {c.scope === "future" ? ` ${t("calendar.cancellations.andFollowing")}` : ""}
            </p>
            <p className="whitespace-pre-wrap break-words">{c.reason}</p>
            <p className="text-xs text-muted-foreground">
              {t(c.sentToStudents ? "calendar.cancellations.sent" : "calendar.cancellations.notSent")}
            </p>
          </div>
        ))}
      </section>
    </>
  );
}
