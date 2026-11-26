/**
 * The "Marcar aula" wizard (PAD-357, with PAD-358's academy step): coach →
 * kind → the private class's three steps (people, when, time: rule 21) or the academy-class step. Opens in place on
 * /availability as a sheet (`class-request-wizard`, data-step = the current
 * step, or "loading" until the coaches are known). The shell owns the coach, the kind, the private class's one draft,
 * the back control and the foot (both outside the scrolled body) and the close.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { listClassRequestCoaches, type ClassRequestCoach } from "@/api/classRequests";
import { CoachStep } from "./CoachStep";
import { KindStep, type ClassRequestKind } from "./KindStep";
import { usePrivateRequestDraft, type PrivateStep } from "@levelup/hooks";
import { PrivateFoot, PrivatePeopleStep, PrivateTimeStep, PrivateWhenStep, usePrivateSend } from "./PrivateSteps";
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
  const [privateStep, setPrivateStep] = useState<PrivateStep>("people");
  const draft = usePrivateRequestDraft(coachId ?? "");
  const scroller = useRef<HTMLDivElement>(null);
  const box = useVisibleViewportBox(open);

  useEffect(() => {
    if (!open) return;
    // Rule 21: a wizard session is one opening; the next one starts with an empty draft.
    draft.reset();
    setPrivateStep("people");
    setStep("coach");
    setCoachId(null);
    setKind(null);
    setCoaches(null);
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

  // Rule 21: a step opens at its top, and the 400 ms lock runs from the commit that shows it.
  useLayoutEffect(() => {
    draft.markShown();
    scroller.current?.scrollTo?.({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, privateStep]);

  const back = () => {
    if (step === "private" && privateStep === "time") setPrivateStep("when");
    else if (step === "private" && privateStep === "when") setPrivateStep("people");
    else if (step === "private" || step === "academy") setStep("kind");
    else if (step === "kind" && (coaches?.length ?? 0) > 1) setStep("coach");
  };
  const canGoBack = step === "private" || step === "academy" || (step === "kind" && (coaches?.length ?? 0) > 1);
  const finish = () => {
    onDone();
    onClose();
  };
  const send = usePrivateSend(draft, coachId ?? "", finish);
  const advance = () => {
    if (!draft.canAdvance() || !draft.stepAnswered(privateStep)) return;
    if (privateStep === "when") draft.confirmDate();
    setPrivateStep(privateStep === "people" ? "when" : "time");
  };
  const coach = coaches?.find((c) => c.id === coachId) ?? null;

  const inPrivate = step === "private" && !!coachId;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] flex flex-col gap-0 overflow-hidden p-0"
        style={box ? { maxHeight: box.maxHeight, bottom: box.bottom } : undefined}
        data-testid="class-request-wizard"
        data-step={coaches === null ? "loading" : step}
      >
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          <SheetHeader className="shrink-0 px-6 pb-3 pt-6">
            <div className="flex items-center gap-2">
              {canGoBack && (
                <Button variant="ghost" size="icon" className="h-11 w-11" onClick={back} aria-label={t("classRequestWizard.back")} data-testid="wizard-back">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              )}
              <SheetTitle>{t("classRequestWizard.title")}</SheetTitle>
            </div>
            <SheetDescription>
              {coach ? t("classRequestWizard.withCoach", { name: coach.name }) : t("classRequestWizard.intro")}
            </SheetDescription>
          </SheetHeader>

          <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-4" data-testid="wizard-body">
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
                  if (k === "private") setPrivateStep("people");
                  setStep(k);
                }}
              />
            )}
            {inPrivate && privateStep === "people" && <PrivatePeopleStep draft={draft} />}
            {inPrivate && privateStep === "when" && <PrivateWhenStep draft={draft} />}
            {inPrivate && privateStep === "time" && <PrivateTimeStep draft={draft} coachId={coachId} onChangeWhen={() => setPrivateStep("when")} />}
            {step === "academy" && coachId && <AcademyClassStep coachId={coachId} onDone={finish} />}
          </div>

          {inPrivate && (
            <div className="shrink-0 border-t bg-background px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]" data-testid="wizard-foot">
              <PrivateFoot step={privateStep} answered={draft.stepAnswered(privateStep)} sending={draft.sending} onContinue={advance} onSend={() => draft.canAdvance() && void send()} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Rule 21 / criterion 64: the sheet follows the visible viewport, so a phone's keyboard does not cover the foot.
 * Without `visualViewport` it keeps its `max-h-[92vh]` and sits at the bottom.
 */
function useVisibleViewportBox(open: boolean): { maxHeight: number; bottom: number } | null {
  const [box, setBox] = useState<{ maxHeight: number; bottom: number } | null>(null);
  useEffect(() => {
    const vv = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!open || !vv) {
      setBox(null);
      return;
    }
    const update = () =>
      setBox({ maxHeight: Math.round(vv.height * 0.92), bottom: Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);
  return box;
}
