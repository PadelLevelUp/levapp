import { useTranslation } from "react-i18next";
import { UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type ClassRequestKind = "private" | "academy";

/** Step 2, "Tipo de aula": a private class (PAD-357) or joining an academy class (PAD-358). */
export function KindStep({ selected, onPick }: { selected: ClassRequestKind | null; onPick: (kind: ClassRequestKind) => void }) {
  const { t } = useTranslation();
  const options: { kind: ClassRequestKind; icon: JSX.Element }[] = [
    { kind: "private", icon: <UserPlus className="w-5 h-5 shrink-0" /> },
    { kind: "academy", icon: <Users className="w-5 h-5 shrink-0" /> },
  ];
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("classRequestWizard.kindStep")}</p>
      <div className="grid gap-2">
        {options.map(({ kind, icon }) => (
          <button
            key={kind}
            type="button"
            onClick={() => onPick(kind)}
            aria-pressed={selected === kind}
            data-testid={`wizard-kind-${kind}`}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted",
              selected === kind && "border-primary bg-primary/5"
            )}
          >
            {icon}
            <span>
              <span className="block font-medium">{t(`classRequestWizard.kind.${kind}.title`)}</span>
              <span className="block text-sm text-muted-foreground">{t(`classRequestWizard.kind.${kind}.description`)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
