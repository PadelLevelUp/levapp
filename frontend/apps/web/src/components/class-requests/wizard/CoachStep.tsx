import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import type { ClassRequestCoach } from "@/api/classRequests";
import { cn } from "@/lib/utils";

/** Step 1, "Treinador": the coaches the student trains with. */
export function CoachStep({
  coaches,
  selected,
  onPick,
}: {
  coaches: ClassRequestCoach[] | null;
  selected: string | null;
  onPick: (coachId: string) => void;
}) {
  const { t } = useTranslation();
  if (coaches === null) return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  if (coaches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="wizard-no-coaches">
        {t("classRequests.noCoaches")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("classRequestWizard.coachStep")}</p>
      <div className="grid gap-2">
        {coaches.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.id)}
            aria-pressed={selected === c.id}
            data-testid={`wizard-coach-${c.id}`}
            className={cn(
              "rounded-lg border p-3 text-left font-medium transition-colors hover:bg-muted",
              selected === c.id && "border-primary bg-primary/5"
            )}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
