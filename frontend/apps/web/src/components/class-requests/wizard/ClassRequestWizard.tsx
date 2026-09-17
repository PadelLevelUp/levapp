/**
 * The "Marcar aula" wizard (PAD-357, with PAD-358's academy step): coach →
 * kind → the private-class step or the academy-class step. Opens in place on
 * /availability as a sheet (`class-request-wizard`, data-step = the current
 * step). The steps own their data; the shell owns the coach, the kind and
 * back / close.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { listClassRequestCoaches, type ClassRequestCoach } from "@/api/classRequests";
import { CoachStep } from "./CoachStep";
import { KindStep, type ClassRequestKind } from "./KindStep";
import { PrivateClassStep } from "./PrivateClassStep";
import { AcademyClassStep } from "./AcademyClassStep";

type Step = "coach" | "kind" | "private" | "academy";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a request (or a waiting-list join) was sent. */
  onDone: () => void;
}

export function ClassRequestWizard({ open, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("coach");
  const [coaches, setCoaches] = useState<ClassRequestCoach[] | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [kind, setKind] = useState<ClassRequestKind | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("coach");
    setCoachId(null);
    setKind(null);
    let active = true;
    listClassRequestCoaches()
      .then((rows) => {
        if (!active) return;
        setCoaches(rows);
        // One coach: skip the choice that has only one answer.
        if (rows.length === 1) {
          setCoachId(rows[0].id);
          setStep("kind");
        }
      })
      .catch(() => active && setCoaches([]));
    return () => {
      active = false;
    };
  }, [open]);

  const back = () => {
    if (step === "private" || step === "academy") setStep("kind");
    else if (step === "kind" && (coaches?.length ?? 0) > 1) setStep("coach");
  };
  const canGoBack = step === "private" || step === "academy" || (step === "kind" && (coaches?.length ?? 0) > 1);
  const finish = () => {
    onDone();
    onClose();
  };
  const coach = coaches?.find((c) => c.id === coachId) ?? null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto" data-testid="class-request-wizard" data-step={step}>
        <div className="mx-auto w-full max-w-lg space-y-5">
          <SheetHeader>
            <div className="flex items-center gap-2">
              {canGoBack && (
                <Button variant="ghost" size="icon" onClick={back} aria-label={t("classRequestWizard.back")} data-testid="wizard-back">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              )}
              <SheetTitle>{t("classRequestWizard.title")}</SheetTitle>
            </div>
            <SheetDescription>
              {coach ? t("classRequestWizard.withCoach", { name: coach.name }) : t("classRequestWizard.intro")}
            </SheetDescription>
          </SheetHeader>

          {step === "coach" && (
            <CoachStep
              coaches={coaches}
              selected={coachId}
              onPick={(id) => {
                setCoachId(id);
                setStep("kind");
              }}
            />
          )}
          {step === "kind" && coachId && (
            <KindStep
              selected={kind}
              onPick={(k) => {
                setKind(k);
                setStep(k);
              }}
            />
          )}
          {step === "private" && coachId && <PrivateClassStep coachId={coachId} onDone={finish} />}
          {step === "academy" && coachId && <AcademyClassStep coachId={coachId} onDone={finish} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
