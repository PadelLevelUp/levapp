/**
 * PAD-839 (dashboard.student-setup-guide rule 4): the guide's dashboard surfaces on web — the
 * first-login sheet, the compact card (a skeleton while a step is unknown, rule 3a), the
 * "Conta pronta" card and the avatar ring. Which of them shows is `setupGuideState`'s answer; these
 * components only draw it and send the guide's writes.
 */
import { useContext, useState, type ReactNode } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthContext";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { SETUP_GUIDE_STEPS, type SetupGuideStep, type SetupGuideView } from "@levelup/config";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ActionCard } from "@/components/dashboard/coach/primitives";
import { useSetupGuide, type SetupGuide } from "./useSetupGuide";

/** The guide's page for one step (rule 5). */
export function setupStepPath(step: SetupGuideStep | null): string {
  return step ? `/setup?step=${step}` : "/setup";
}

/** The 5-part bar: green for a done step, blue for the current one, grey for the rest. */
export function SetupGuideBar({ view }: { view: SetupGuideView }) {
  return (
    <div className="flex gap-1" data-testid="setup-guide-bar" aria-hidden>
      {SETUP_GUIDE_STEPS.map((s) => {
        const state = view.steps[s];
        const tone =
          state === "unknown"
            ? "bg-muted animate-pulse"
            : state === "done"
              ? "bg-success"
              : s === view.next
                ? "bg-primary"
                : "bg-muted";
        return <span key={s} data-step={s} data-state={state} className={`h-1.5 flex-1 rounded-full ${tone}`} />;
      })}
    </div>
  );
}

export function SetupGuideCard({ guide }: { guide: SetupGuide }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { view } = guide;
  const [closing, setClosing] = useState(false);

  if (view.showReady) {
    return (
      <ActionCard className="border-success/40 bg-success/5" testId="setup-guide-ready">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold tracking-wide text-success">{t("setupGuide.ready.eyebrow")}</span>
          <h2 className="font-display text-lg font-semibold">{t("setupGuide.ready.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("setupGuide.ready.body")}</p>
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={closing}
              data-testid="setup-guide-ready-close"
              onClick={async () => {
                setClosing(true);
                try {
                  await guide.write({ setupGuideReadyClosed: true });
                } finally {
                  setClosing(false);
                }
              }}
            >
              {t("setupGuide.ready.close")}
            </Button>
          </div>
        </div>
      </ActionCard>
    );
  }
  if (!view.showCard) return null;

  if (view.percent === null) {
    return (
      <ActionCard testId="setup-guide-card">
        <div className="flex flex-col gap-3" data-state="loading" aria-busy>
          <span className="text-sm text-muted-foreground">{t("setupGuide.card.loading")}</span>
          <SetupGuideBar view={view} />
        </div>
      </ActionCard>
    );
  }

  const open = () => navigate(setupStepPath(view.next));
  return (
    <ActionCard accent="accent" testId="setup-guide-card">
      <div className="flex flex-col gap-3" data-state="ready" data-percent={view.percent}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground">
            {t("setupGuide.card.eyebrow", { done: view.doneCount })}
          </span>
          <span className="font-display text-lg font-semibold tabular-nums" data-testid="setup-guide-percent">
            {view.percent}%
          </span>
        </div>
        <h2 className="font-display text-base font-semibold">{t("setupGuide.card.title")}</h2>
        <SetupGuideBar view={view} />
        {view.next && (
          <p className="text-sm text-muted-foreground" data-testid="setup-guide-next">
            {t("setupGuide.card.nextLabel", { step: t(`setupGuide.steps.${view.next}.title`) })}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={open} data-testid="setup-guide-continue">
            {t("setupGuide.card.continue")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate("/setup")} data-testid="setup-guide-all">
            {t("setupGuide.card.all")}
          </Button>
        </div>
      </div>
    </ActionCard>
  );
}

/** The five steps as the sheet and the overview list them. */
export function SetupGuideStepList({ view }: { view: SetupGuideView }) {
  const { t } = useTranslation();
  return (
    <ol className="flex flex-col gap-2" data-testid="setup-guide-steps">
      {SETUP_GUIDE_STEPS.map((s) => {
        const done = view.steps[s] === "done";
        return (
          <li
            key={s}
            className="flex items-center gap-3 rounded-lg border border-border p-3"
            data-testid={`setup-guide-step-${s}`}
            data-state={view.steps[s]}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                done ? "bg-success text-white" : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : SETUP_GUIDE_STEPS.indexOf(s) + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">{t(`setupGuide.steps.${s}.title`)}</span>
              <span className="text-xs text-muted-foreground">{t(`setupGuide.steps.${s}.hint`)}</span>
            </span>
            {done ? (
              <span className="text-xs font-medium text-success">{t("setupGuide.done")}</span>
            ) : s === view.next ? (
              <span className="text-xs font-medium text-primary">{t("setupGuide.next")}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The first-login sheet. Closing it in any way except "Não mostrar mais" snoozes it (rule 4):
 * "Agora não", "Começar" (which also opens the next pending step), a swipe or the backdrop.
 */
export function SetupGuideSheet({ guide }: { guide: SetupGuide }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { view } = guide;
  const [dismissed, setDismissed] = useState(false);
  const open = view.showSheet && !dismissed;

  const close = (then?: () => void) => {
    setDismissed(true);
    void guide.write({ setupGuideSnooze: true }).catch(() => undefined);
    then?.();
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (!next && open ? close() : undefined)}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-2xl" data-testid="setup-guide-sheet">
        <SheetHeader className="text-left">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground">{t("setupGuide.sheet.eyebrow")}</span>
          <SheetTitle className="font-display text-2xl">{t("setupGuide.sheet.title")}</SheetTitle>
          <SheetDescription>{t("setupGuide.sheet.body")}</SheetDescription>
        </SheetHeader>
        <div className="my-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span data-testid="setup-guide-progress">
              {t("setupGuide.progress", { done: view.doneCount, percent: view.percent ?? 0 })}
            </span>
          </div>
          <SetupGuideBar view={view} />
          <SetupGuideStepList view={view} />
        </div>
        <div className="flex flex-col gap-2">
          <Button data-testid="setup-guide-start" onClick={() => close(() => navigate(setupStepPath(view.next)))}>
            {t("setupGuide.sheet.start")}
          </Button>
          <Button variant="outline" data-testid="setup-guide-later" onClick={() => close()}>
            {t("setupGuide.sheet.later")}
          </Button>
          <Button
            variant="ghost"
            data-testid="setup-guide-hide"
            onClick={() => {
              setDismissed(true);
              void guide.write({ setupGuideHidden: true }).catch(() => undefined);
            }}
          >
            {t("setupGuide.sheet.hide")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t("setupGuide.sheet.footer")}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The avatar ring: filled to the percent while the card would show (rule 4), student only. */
export function SetupGuideRing({ view, children }: { view: SetupGuideView; children: ReactNode }) {
  const { t } = useTranslation();
  if (!view.showRing) return <>{children}</>;
  const pct = view.percent ?? 0;
  return (
    <span
      className="relative inline-flex rounded-full p-[2px]"
      style={{ background: `conic-gradient(hsl(var(--primary)) ${pct * 3.6}deg, hsl(var(--muted)) 0deg)` }}
      data-testid="setup-guide-ring"
      data-percent={view.percent ?? ""}
      aria-label={view.percent === null ? undefined : t("setupGuide.ring", { percent: pct })}
    >
      <span className="inline-flex rounded-full bg-background p-[1px]">{children}</span>
    </span>
  );
}

/**
 * Mount the guide only for a signed-in student, and only under a query client: the layout and the
 * dashboard are also rendered by tests and screens that have none, where the guide has nothing to
 * read (the same reason AuthContext reads its client through the context).
 */
function useGuideMountable(): boolean {
  const { user } = useAuth();
  const client = useContext(QueryClientContext);
  return client != null && user != null && !(user.roles ?? []).includes("coach");
}

function DashboardGuide() {
  const guide = useSetupGuide();
  return (
    <>
      <SetupGuideSheet guide={guide} />
      <SetupGuideCard guide={guide} />
    </>
  );
}

/** The student dashboard's guide: the first-login sheet and the card (rule 4). */
export function SetupGuideOnDashboard() {
  return useGuideMountable() ? <DashboardGuide /> : null;
}

function RingFromGuide({ children }: { children: ReactNode }) {
  const guide = useSetupGuide();
  return <SetupGuideRing view={guide.view}>{children}</SetupGuideRing>;
}

/** The layout's avatar, ringed for a student while the guide is open (rule 4). */
export function SetupGuideAvatar({ children }: { children: ReactNode }) {
  return useGuideMountable() ? <RingFromGuide>{children}</RingFromGuide> : <>{children}</>;
}
