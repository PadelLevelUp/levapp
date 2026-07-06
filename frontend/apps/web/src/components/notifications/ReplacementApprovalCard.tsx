import { useState } from "react";
import { Check, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import type { ApprovalAction, ApprovalBundle, ApprovalVacancyResult } from "@/types";
import { respondToApproval } from "@/api/notificationEngine";

function formatWindowOpen(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ReplacementApprovalCardProps {
  bundle: ApprovalBundle;
  onResult?: (
    action: ApprovalAction,
    vacancies: { vacancyId: number; result: ApprovalVacancyResult }[]
  ) => void;
  /** Render without action buttons (e.g. when viewing your own message) */
  readOnly?: boolean;
}

export function ReplacementApprovalCard({
  bundle,
  onResult,
  readOnly = false,
}: ReplacementApprovalCardProps) {
  const { t } = useTranslation();
  const [responding, setResponding] = useState(false);
  const [localResponse, setLocalResponse] = useState<ApprovalAction | null>(
    bundle.responded ? bundle.response ?? null : null
  );
  const [staleVacancyIds, setStaleVacancyIds] = useState<number[]>([]);

  // Window state computed at render time
  const windowOpenInFuture =
    !!bundle.windowOpenAt && new Date(bundle.windowOpenAt).getTime() > Date.now();
  const windowLabel = bundle.windowOpenAt ? formatWindowOpen(bundle.windowOpenAt) : null;

  const allStale =
    staleVacancyIds.length > 0 &&
    bundle.vacancies.every((v) => staleVacancyIds.includes(v.vacancyId));

  const handleRespond = async (action: ApprovalAction) => {
    if (responding || localResponse) return;
    setResponding(true);
    try {
      const result = await respondToApproval(bundle.bundleId, action);
      setLocalResponse(result.action);
      const stale = result.vacancies
        .filter((v) => v.result === "stale")
        .map((v) => v.vacancyId);
      setStaleVacancyIds(stale);
      if (stale.length === result.vacancies.length && stale.length > 0) {
        toast.info(t("notificationsUi.replacementApproval.spotsFilledOrExpired"));
      }
      onResult?.(result.action, result.vacancies);
    } catch {
      toast.error(t("notificationsUi.replacementApproval.genericError"));
    } finally {
      setResponding(false);
    }
  };

  const renderQueueBadge = (player: {
    roundNumber?: number;
    groupIndex?: number;
    groupLabel?: string;
  }) => {
    const label =
      player.groupLabel ??
      (player.roundNumber != null
        ? t("notificationsUi.replacementApproval.round", { number: player.roundNumber })
        : player.groupIndex != null
          ? t("notificationsUi.replacementApproval.group", { index: player.groupIndex })
          : null);
    if (!label) return null;
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
        {label}
      </span>
    );
  };

  const responseBadge = () => {
    if (allStale) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-600">
          {t("notificationsUi.replacementApproval.noLongerNeeded")}
        </span>
      );
    }
    switch (localResponse) {
      case "yes_now":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Check className="w-3.5 h-3.5" />
            {t("notificationsUi.replacementApproval.approved")}
          </span>
        );
      case "yes_at_window":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Clock className="w-3.5 h-3.5" />
            {t("notificationsUi.replacementApproval.scheduledFor", {
              window: windowLabel ?? t("notificationsUi.replacementApproval.windowOpen"),
            })}
          </span>
        );
      case "dismiss":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-destructive/15 text-destructive">
            <X className="w-3.5 h-3.5" />
            {t("notificationsUi.replacementApproval.dismissed")}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      data-testid="replacement-approval-card"
      className="rounded-xl border bg-card shadow-sm p-3 space-y-3"
    >
      {bundle.vacancies.map((vacancy) => {
        const isStale = staleVacancyIds.includes(vacancy.vacancyId);
        return (
          <div key={vacancy.vacancyId} className="space-y-2">
            <p className="text-sm leading-relaxed">
              <span className="font-semibold">{vacancy.declinedPlayerName}</span>{" "}
              {t("notificationsUi.replacementApproval.confirmedWontAttend")}
            </p>

            {vacancy.waitingListPlayerName && (
              <p className="text-xs leading-relaxed">
                <span className="font-medium">{vacancy.waitingListPlayerName}</span>{" "}
                {t("notificationsUi.replacementApproval.waitingListAdded")}
              </p>
            )}

            {vacancy.queue.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("notificationsUi.replacementApproval.inviteQueue")}
                </p>
                <ol className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-sm">
                  {vacancy.queue.map((player, index) => (
                    <li key={player.id} className="contents">
                      <span className="text-xs text-muted-foreground text-right">
                        {index + 1}.
                      </span>
                      <span className="text-center">{player.name}</span>
                      <span className="justify-self-start">
                        {renderQueueBadge(player)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="text-xs italic text-muted-foreground">
                {t("notificationsUi.replacementApproval.noEligiblePlayers")}
              </p>
            )}

            {isStale && !allStale && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                {t("notificationsUi.replacementApproval.noLongerNeeded")}
              </span>
            )}
          </div>
        );
      })}

      {localResponse || allStale ? (
        <div className="flex">{responseBadge()}</div>
      ) : readOnly ? null : (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t("notificationsUi.replacementApproval.inviteReplacements")}
          </p>
          <div className="flex flex-wrap gap-2">
            {/* NOTE: no aria-label here — the visible text must be the accessible
                name so E2E locators getByRole("button", { name: /yes, right now/i })
                and { name: /^no$/i } match (aria-label would override it). */}
            <button
              type="button"
              data-testid="approve-invitations-now"
              onClick={() => handleRespond("yes_now")}
              disabled={responding}
              className="flex-1 min-w-[7rem] py-1.5 px-3 text-sm font-medium rounded-xl bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
            >
              {responding ? "…" : t("notificationsUi.replacementApproval.yesRightNow")}
            </button>
            {windowOpenInFuture && windowLabel && (
              <button
                type="button"
                aria-label={t("notificationsUi.replacementApproval.approveAtWindowAria")}
                onClick={() => handleRespond("yes_at_window")}
                disabled={responding}
                className="flex-1 min-w-[7rem] py-1.5 px-3 text-sm font-medium rounded-xl bg-primary/10 text-primary disabled:opacity-50 transition-opacity"
              >
                {responding
                  ? "…"
                  : t("notificationsUi.replacementApproval.yesAt", { window: windowLabel })}
              </button>
            )}
            <button
              type="button"
              data-testid="dismiss-invitations"
              onClick={() => handleRespond("dismiss")}
              disabled={responding}
              className="flex-1 min-w-[4rem] py-1.5 px-3 text-sm font-medium rounded-xl bg-muted text-foreground disabled:opacity-50 transition-opacity"
            >
              {responding ? "…" : t("notificationsUi.replacementApproval.no")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
