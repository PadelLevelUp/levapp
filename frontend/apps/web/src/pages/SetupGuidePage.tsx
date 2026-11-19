/**
 * PAD-839 (dashboard.student-setup-guide rules 5–8, 12, 13): the student setup guide's steps on web.
 * `/setup` lists the five steps; `/setup?step=<step>` opens one. Finishing or skipping a step goes to
 * the next pending one after it; past the last, back to the dashboard. Skipping writes nothing.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { dashboardApi } from "@levelup/api";
import {
  SETUP_GUIDE_STEPS,
  nextPendingStepAfter,
  type SetupGuideStep,
} from "@levelup/config";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthContext";
import { SetupGuideBar, SetupGuideStepList, setupStepPath } from "@/components/setup-guide/SetupGuideSurfaces";
import { useSetupGuide, type SetupGuide } from "@/components/setup-guide/useSetupGuide";
import { StepUnavailability } from "@/components/setup-guide/StepUnavailability";

function isStep(value: string | null): value is SetupGuideStep {
  return value != null && (SETUP_GUIDE_STEPS as readonly string[]).includes(value);
}

export default function SetupGuidePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const guide = useSetupGuide();
  const raw = params.get("step");
  const step = isStep(raw) ? raw : null;

  if (!step) {
    return (
      <AppLayout>
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4 p-4" data-testid="setup-guide-overview">
          <h1 className="font-display text-2xl font-bold">{t("setupGuide.sheet.title")}</h1>
          {guide.view.percent !== null && (
            <span className="text-sm text-muted-foreground" data-testid="setup-guide-progress">
              {t("setupGuide.progress", { done: guide.view.doneCount, percent: guide.view.percent })}
            </span>
          )}
          <SetupGuideBar view={guide.view} />
          <SetupGuideStepList view={guide.view} />
          {guide.view.next && (
            <Button onClick={() => navigate(setupStepPath(guide.view.next))} data-testid="setup-guide-overview-continue">
              {t("setupGuide.card.continue")}
            </Button>
          )}
        </div>
      </AppLayout>
    );
  }

  /** Rule 5: the next pending step after this one, or the dashboard past the last. */
  const goNext = (from: SetupGuideStep = step) => {
    const next = nextPendingStepAfter(guide.view, from);
    navigate(next ? setupStepPath(next) : "/dashboard");
  };
  const leave = () => navigate("/dashboard");
  const n = SETUP_GUIDE_STEPS.indexOf(step) + 1;

  return (
    <AppLayout>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-5 p-4" data-testid={`setup-step-${step}`}>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate("/setup")} aria-label={t("setupGuide.step.back")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground" data-testid="setup-step-counter">
            {t("setupGuide.step.counter", { n })}
          </span>
          {step !== "profile" ? (
            <Button variant="ghost" size="sm" onClick={() => goNext()} data-testid="setup-step-skip">
              {t("setupGuide.step.skip")}
            </Button>
          ) : (
            <span className="w-9" />
          )}
        </div>
        {step === "request_alerts" && <StepRequestAlerts guide={guide} onDone={() => goNext()} onLeave={leave} />}
        {step === "device_push" && <StepDevicePush guide={guide} onDone={() => goNext()} onLeave={leave} />}
        {step === "unavailability" && <StepUnavailability guide={guide} onDone={() => goNext()} onLeave={leave} />}
        {step === "coach_link" && <StepCoachLink onLeave={leave} />}
        {step === "profile" && <StepProfile guide={guide} onLeave={leave} />}
      </div>
    </AppLayout>
  );
}

function LeaveButton({ onLeave, label }: { onLeave: () => void; label: string }) {
  return (
    <Button variant="ghost" onClick={onLeave} data-testid="setup-step-later">
      {label}
    </Button>
  );
}

/** Rule 6: switch request alerts on straight away (no Settings save), then refresh the session. */
export function StepRequestAlerts({
  guide,
  onDone,
  onLeave,
}: {
  guide: SetupGuide;
  onDone: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const items = ["invites", "reminders", "presence", "answers"] as const;

  const enable = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await guide.write({ requestAlerts: true, setupGuideAlertsConfirmed: true });
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold">{t("setupGuide.alerts.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("setupGuide.alerts.body")}</p>
      <span className="text-xs font-semibold tracking-wide text-muted-foreground">{t("setupGuide.alerts.youGet")}</span>
      <ul className="flex flex-col gap-2">
        {items.map((k) => (
          <li key={k} className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-success" />
            {t(`setupGuide.alerts.items.${k}`)}
          </li>
        ))}
      </ul>
      <div className="rounded-lg border border-border p-3">
        <div className="text-sm font-medium">{t("setupGuide.alerts.switchLabel")}</div>
        <div className="text-xs text-muted-foreground">{t("setupGuide.alerts.switchHint")}</div>
      </div>
      {failed && (
        <p className="text-sm text-destructive" role="alert">
          {t("setupGuide.alerts.failed")}
        </p>
      )}
      <Button onClick={() => void enable()} disabled={busy} data-testid="setup-alerts-enable">
        {t("setupGuide.alerts.enable")}
      </Button>
      <LeaveButton onLeave={onLeave} label={t("setupGuide.step.later")} />
    </div>
  );
}

/**
 * Rule 7 on web, under OQ-C (a): opening the step never prompts; its button subscribes through the
 * same path as the Messages enable prompt. Denied → the padlock help, whose "Já mudei, verificar"
 * reads the permission again (a denied browser answers with no prompt).
 */
export function StepDevicePush({
  guide,
  onDone,
  onLeave,
}: {
  guide: SetupGuide;
  onDone: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const state = guide.device;
  const title = state === "ios_browser" ? t("setupGuide.device.titleIosBrowser") : t("setupGuide.device.titleWeb");

  const ask = async () => {
    setBusy(true);
    try {
      if (await guide.subscribe()) onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="setup-device" data-state={state ?? "unknown"}>
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground">{t("setupGuide.device.body")}</p>
      {state === "ask" && (
        <>
          <span className="text-xs font-semibold tracking-wide text-muted-foreground">{t("setupGuide.device.howTo")}</span>
          <ol className="list-decimal pl-5 text-sm">
            <li>{t("setupGuide.device.howToTap")}</li>
            <li>{t("setupGuide.device.hintWeb")}</li>
          </ol>
          <Button onClick={() => void ask()} disabled={busy} data-testid="setup-device-allow">
            {t("setupGuide.device.allow")}
          </Button>
        </>
      )}
      {state === "padlock" && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3" data-testid="setup-device-padlock">
          <span className="text-sm font-medium">{t("setupGuide.device.deniedTitle")}</span>
          <span className="text-sm text-muted-foreground">{t("setupGuide.device.deniedWeb")}</span>
          <Button variant="outline" onClick={() => void ask()} disabled={busy} data-testid="setup-device-recheck">
            {t("setupGuide.device.recheck")}
          </Button>
        </div>
      )}
      {state === "ios_browser" && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3" data-testid="setup-device-ios-browser">
          <span className="text-sm font-medium">{t("setupGuide.device.iosBrowserTitle")}</span>
          <span className="text-sm text-muted-foreground">{t("setupGuide.device.iosBrowserBody")}</span>
          <Button asChild variant="outline" data-testid="setup-device-app-store">
            <a href="https://apps.apple.com/app/levapp" target="_blank" rel="noreferrer">
              {t("setupGuide.device.appStore")}
            </a>
          </Button>
        </div>
      )}
      {state === "unsupported" && <p className="text-sm text-muted-foreground">{t("setupGuide.device.unsupported")}</p>}
      {state === "done" && <p className="text-sm text-success">{t("setupGuide.device.doneBody")}</p>}
      <LeaveButton onLeave={onLeave} label={t("setupGuide.step.later")} />
    </div>
  );
}

/** Rule 12: a coach's link links the student by itself; otherwise the existing connect flow. */
export function StepCoachLink({ onLeave }: { onLeave: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const coaches = user?.coaches ?? [];
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold">{t("setupGuide.coach.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("setupGuide.coach.body")}</p>
      {coaches.length > 0 && (
        <p className="text-sm text-success" data-testid="setup-coach-linked">
          {t("setupGuide.coach.linked", { names: coaches.map((c) => c.name).join(", ") })}
        </p>
      )}
      <div className="rounded-lg border border-border p-3">
        <div className="text-sm font-medium">{t("setupGuide.coach.linkTitle")}</div>
        <div className="text-xs text-muted-foreground">{t("setupGuide.coach.linkBody")}</div>
      </div>
      <div className="rounded-lg border border-border p-3">
        <div className="text-sm font-medium">{t("setupGuide.coach.noCoachTitle")}</div>
        <div className="text-xs text-muted-foreground">{t("setupGuide.coach.noCoachBody")}</div>
      </div>
      <Button asChild data-testid="setup-connect">
        <Link to="/connect">{t("setupGuide.coach.connect")}</Link>
      </Button>
      <LeaveButton onLeave={onLeave} label={t("setupGuide.coach.later")} />
    </div>
  );
}

/**
 * Rule 13: each linked coach's level and side (from `/auth/me`), "Por definir" when unset; one
 * "Lembrar treinador" per coach the dashboard lists as incomplete and remindable. The student can
 * never mark this step done.
 */
export function StepProfile({ guide, onLeave }: { guide: SetupGuide; onLeave: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const coaches = user?.coaches ?? [];
  const [sentNow, setSentNow] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState<number | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const incomplete = new Map(guide.incompleteCoaches.map((c) => [c.coachId, c]));
  const anyReminded = guide.incompleteCoaches.some((c) => c.remindedToday) || sentNow.size > 0;

  const remind = async (coachId: number) => {
    setSending(coachId);
    setFailed(null);
    try {
      await dashboardApi.sendProfileReminder(coachId);
      setSentNow((prev) => new Set(prev).add(coachId));
    } catch (error) {
      const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === "already_reminded") setSentNow((prev) => new Set(prev).add(coachId));
      else setFailed(coachId);
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold">{t("setupGuide.profile.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("setupGuide.profile.body")}</p>
      {coaches.length === 0 && <p className="text-sm">{t("setupGuide.profile.noCoach")}</p>}
      {guide.view.steps.profile === "done" && <p className="text-sm text-success">{t("setupGuide.profile.allSet")}</p>}
      {coaches.map((c) => {
        const entry = incomplete.get(c.id);
        const reminded = Boolean(entry?.remindedToday) || sentNow.has(c.id);
        return (
          <div key={c.id} className="flex flex-col gap-2 rounded-lg border border-border p-3" data-testid={`setup-profile-coach-${c.id}`}>
            <div className="text-sm">
              <span className="text-muted-foreground">{t("setupGuide.profile.coach")}: </span>
              <span className="font-medium">{c.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div data-testid={`setup-profile-level-${c.id}`}>
                <span className="text-muted-foreground">{t("setupGuide.profile.level")}: </span>
                {c.level ?? t("setupGuide.profile.unset")}
              </div>
              <div data-testid={`setup-profile-side-${c.id}`}>
                <span className="text-muted-foreground">{t("setupGuide.profile.side")}: </span>
                {c.side ? t(`setupGuide.profile.sides.${c.side}`) : t("setupGuide.profile.unset")}
              </div>
            </div>
            {entry && entry.canRemind !== false && (
              reminded ? (
                <p className="text-sm text-success" data-testid={`setup-reminded-${c.id}`}>
                  {t("setupGuide.profile.reminded", { coach: c.name })}
                </p>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sending === c.id}
                    onClick={() => void remind(c.id)}
                    data-testid={`setup-remind-${c.id}`}
                  >
                    {t("setupGuide.profile.remind")}
                  </Button>
                  <span className="text-xs text-muted-foreground">{t("setupGuide.profile.remindHint", { coach: c.name })}</span>
                </>
              )
            )}
            {failed === c.id && (
              <p className="text-sm text-destructive" role="alert">
                {t("setupGuide.profile.remindFailed")}
              </p>
            )}
          </div>
        );
      })}
      <Button variant={anyReminded ? "default" : "ghost"} onClick={onLeave} data-testid="setup-step-later">
        {anyReminded ? t("setupGuide.profile.toDashboard") : t("setupGuide.profile.finishLater")}
      </Button>
    </div>
  );
}
