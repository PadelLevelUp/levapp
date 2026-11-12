import { useState } from "react";
import { Check, Clock, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { useCoachDisplayName } from "@levelup/hooks";
import { useTranslation } from "react-i18next";

import type { ApprovalAction, ApprovalBundle, ApprovalVacancyResult } from "@/types";
import type { EngineApprovalMeta, EngineApprovalRespondResult, EngineApprovalState } from "@levelup/types";
import { respondToApproval, respondToEngineApproval } from "@/api/notificationEngine";
import {
  approvalDisplayGroups,
  approvalEmptyReasonKey,
  approvalGroupLabel,
  approvalQueuePreview,
  approvalSideKey,
  approvalStaleLabel,
  engineApprovalRequest,
  engineApprovalYesLabel,
  engineEmptyQueueReasons,
  engineSideKey,
  engineSideSlug,
  isEngineApproval,
  lisbonNowMs,
  queueAsOfLabel,
  queueBadgeLabel,
  resolveText,
  resolvedVacancyIds,
  staleCount,
  wallClockISOMs,
} from "@levelup/config";

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
  /** PAD-545 (semi-auto-approval rule 8): "Ignorar" exists only on the class's card; the
   * conversation offers the send buttons alone. */
  allowDismiss?: boolean;
  /** PAD-770 (rule 12b): when the message's queue was built. The conversation passes it, so the
   * card says the list is from then; the class's card shows the queue as it is now and omits it. */
  queueAsOf?: string | null;
}

type EngineSource = EngineApprovalMeta | EngineApprovalState;

/**
 * PAD-920 (semi-auto-approval N5): a new-engine request (the message's `engine: "new"` metadata,
 * or the class's EngineApprovalState) draws its own card; every other bundle is today's card.
 */
export function ReplacementApprovalCard({
  bundle,
  onEngineResult,
  ...props
}: Omit<ReplacementApprovalCardProps, "bundle"> & {
  bundle: ApprovalBundle | EngineSource;
  onEngineResult?: (result: EngineApprovalRespondResult) => void;
}) {
  if (isEngineApproval(bundle)) {
    return <EngineApprovalCard source={bundle} onResult={onEngineResult} readOnly={props.readOnly} allowDismiss={props.allowDismiss} />;
  }
  return <BundleApprovalCard bundle={bundle} {...props} />;
}

function BundleApprovalCard({
  bundle,
  onResult,
  readOnly = false,
  allowDismiss = false,
  queueAsOf = null,
}: ReplacementApprovalCardProps) {
  const { t } = useTranslation();
  // PAD-660 rule 8: the approval card is the coach's — queue names and the freed spot use the nickname.
  const displayName = useCoachDisplayName();
  const [responding, setResponding] = useState(false);
  const [localResponse, setLocalResponse] = useState<ApprovalAction | null>(
    bundle.responded ? bundle.response ?? null : null
  );
  const [respondedStaleIds, setStaleVacancyIds] = useState<number[]>([]);
  // PAD-765 (rule 11): a spot the server marked filled or expired on the message is stale too,
  // read on every render so a live edit of the message shows it.
  const staleVacancyIds = [...new Set([...respondedStaleIds, ...resolvedVacancyIds(bundle)])];
  // PAD-574 (rule 7a): which blocks show their whole list; the preview is the first five.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groups = approvalDisplayGroups(bundle.vacancies);
  const asOf = queueAsOfLabel(queueAsOf);

  // Window state computed at render time
  const windowOpenInFuture =
    !!bundle.windowOpenAt && wallClockISOMs(bundle.windowOpenAt) > lisbonNowMs();
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
      if (result.superseded) {
        // PAD-545: a recompute replaced this list; nothing was decided.
        toast.info(t("notificationsUi.replacementApproval.superseded"));
      } else if (stale.length === result.vacancies.length && stale.length > 0) {
        toast.info(t("notificationsUi.replacementApproval.spotsFilledOrExpired"));
      }
      onResult?.(result.action, result.vacancies);
    } catch {
      toast.error(t("notificationsUi.replacementApproval.genericError"));
    } finally {
      setResponding(false);
    }
  };

  const renderQueueBadge = (player: Parameters<typeof queueBadgeLabel>[0]) => {
    // PAD-446: one rule for web and iOS (@levelup/config) — a waiting-list student is marked first.
    const badge = queueBadgeLabel(player);
    const label = !badge ? null : "text" in badge ? badge.text : t(badge.key, badge.params);
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
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-warning/15 text-warning-strong">
          {t("notificationsUi.replacementApproval.noLongerNeeded")}
        </span>
      );
    }
    switch (localResponse) {
      case "yes_now":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-success/15 text-success-strong">
            <Check className="w-3.5 h-3.5" />
            {t("notificationsUi.replacementApproval.approved")}
          </span>
        );
      case "yes_at_window":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-success/15 text-success-strong">
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
      data-bundle-id={bundle.bundleId}
      className="rounded-xl border bg-card shadow-sm p-3 space-y-3"
    >
      {groups.map((group) => {
        const stale = staleCount(group, staleVacancyIds);
        const isExpanded = !!expanded[group.key];
        const { shown, hidden } = approvalQueuePreview(group.queue, isExpanded);
        return (
          <div key={group.key} className="space-y-2" data-testid="approval-block" data-kind={group.kind}>
            {/* PAD-574 (rule 4): a freed spot names the student; a never-filled spot is an open spot. */}
            {group.kind === "declined" ? (
              <p className="text-sm leading-relaxed" data-testid="approval-reason-declined">
                {t("notificationsUi.replacementApproval.declinedReason", {
                  name: displayName(
                    bundle.vacancies.find((v) => v.vacancyId === group.vacancyIds[0])?.declinedPlayerId,
                    group.declinedPlayerName ?? "",
                  ),
                })}
              </p>
            ) : (
              <div className="space-y-0.5">
                <p className="text-sm leading-relaxed" data-testid="approval-reason-open">
                  {t("notificationsUi.replacementApproval.openSpotReason")}
                </p>
                <p className="text-xs font-medium text-muted-foreground" data-testid="approval-group-label">
                  {(() => {
                    const label = approvalGroupLabel(group, t(approvalSideKey(group.side)));
                    return t(label.key, label.params);
                  })()}
                </p>
              </div>
            )}

            {group.queue.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("notificationsUi.replacementApproval.inviteQueue")}
                </p>
                <ol className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-sm">
                  {shown.map((player, index) => (
                    <li key={player.id} className="contents">
                      <span className="text-xs text-muted-foreground text-right">
                        {index + 1}.
                      </span>
                      <span className="text-center">{displayName(player.id, player.name)}</span>
                      <span className="justify-self-start">
                        {renderQueueBadge(player)}
                      </span>
                    </li>
                  ))}
                </ol>
                {/* Rule 7a: the preview is never the invite set; say so whenever it is truncated. */}
                {hidden > 0 && (
                  <p className="text-[11px] text-muted-foreground" data-testid="approval-showing-of">
                    {t("notificationsUi.replacementApproval.showingOf", { shown: shown.length, total: group.queue.length })}
                  </p>
                )}
                {(hidden > 0 || isExpanded) && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    data-testid="approval-show-more"
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded((e) => ({ ...e, [group.key]: !isExpanded }))}
                  >
                    {isExpanded
                      ? t("notificationsUi.replacementApproval.showLess")
                      : t("notificationsUi.replacementApproval.showMore", { count: hidden })}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                <p className="text-xs italic text-muted-foreground">
                  {t("notificationsUi.replacementApproval.noEligiblePlayers")}
                </p>
                {/* PAD-661 (rule 4b): an empty queue says why, one line per engine stage. */}
                {group.emptyQueueReasons.length > 0 && (
                  <ul className="text-xs text-muted-foreground" data-testid="approval-empty-reasons">
                    {group.emptyQueueReasons.map((r) => (
                      <li key={r.stage} data-testid={`approval-empty-reason-${r.stage}`}>
                        {t(approvalEmptyReasonKey(r.stage), { count: r.count })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {stale > 0 && !allStale && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-warning/15 text-warning-strong"
                data-testid="approval-group-stale"
              >
                {(() => {
                  const label = approvalStaleLabel(group, stale);
                  return t(label.key, label.params);
                })()}
              </span>
            )}
          </div>
        );
      })}

      {asOf ? (
        <p data-testid="approval-queue-as-of" className="text-xs text-muted-foreground">
          {t(asOf.key, asOf.values)}
        </p>
      ) : null}

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
            {allowDismiss && (
              <button
                type="button"
                data-testid="dismiss-invitations"
                onClick={() => handleRespond("dismiss")}
                disabled={responding}
                className="flex-1 min-w-[4rem] py-1.5 px-3 text-sm font-medium rounded-xl bg-muted text-foreground disabled:opacity-50 transition-opacity"
              >
                {responding ? "…" : t("notificationsUi.replacementApproval.ignore")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New engine (PAD-920, semi-auto-approval N5)
// ---------------------------------------------------------------------------

type EngineOutcome = EngineApprovalRespondResult["result"];

function EngineApprovalCard({
  source,
  onResult,
  readOnly = false,
  allowDismiss = false,
}: {
  source: EngineSource;
  onResult?: (result: EngineApprovalRespondResult) => void;
  readOnly?: boolean;
  allowDismiss?: boolean;
}) {
  const { t } = useTranslation();
  const displayName = useCoachDisplayName();
  const request = engineApprovalRequest(source);
  const [responding, setResponding] = useState(false);
  const [outcome, setOutcome] = useState<EngineOutcome | null>(request?.state === "dismissed" ? "dismissed" : null);
  // N5: the students the coach takes off the list; "Sim" invites everyone else in the queues.
  const [removed, setRemoved] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  if (!request) return null;
  // A message the coach already answered offers nothing more; its answer is on the class.
  const actionable = !outcome && !request.responded && !readOnly;

  const toggle = (playerId: string) =>
    setRemoved((r) => (r.includes(playerId) ? r.filter((id) => id !== playerId) : [...r, playerId]));

  const respond = async (action: "yes_now" | "dismiss") => {
    if (responding || !actionable) return;
    setResponding(true);
    try {
      const result = await respondToEngineApproval(
        action === "yes_now" ? { bundleId: request.requestId, action, removed } : { bundleId: request.requestId, action },
      );
      setOutcome(result.result);
      onResult?.(result);
    } catch {
      toast.error(t("notificationsUi.replacementApproval.genericError"));
    } finally {
      setResponding(false);
    }
  };

  const yesLabel = engineApprovalYesLabel(removed.length);

  return (
    <div
      data-testid="replacement-approval-card"
      data-request-id={request.requestId}
      className="rounded-xl border bg-card shadow-sm p-3 space-y-3"
    >
      {request.spotTypes.map((type, index) => {
        const slug = engineSideSlug(type.side);
        const isExpanded = !!expanded[index];
        const { shown, hidden } = approvalQueuePreview(type.queue, isExpanded);
        const reasons = engineEmptyQueueReasons(type);
        return (
          <div key={`${slug}-${type.levelId ?? "any"}-${index}`} className="space-y-2" data-testid={`approval-type-${slug}`}>
            <p className="text-xs font-medium text-muted-foreground" data-testid="approval-type-header">
              {t(engineSideKey(type.side))}
              {type.levelLabel ? ` · ${type.levelLabel}` : ""}
            </p>
            {type.queue.length > 0 ? (
              <div className="space-y-1">
                <ol className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-sm">
                  {shown.map((entry, i) => {
                    const name = displayName(entry.playerId, entry.nickname ?? entry.name);
                    const isRemoved = removed.includes(entry.playerId);
                    return (
                      <li key={entry.playerId} className="contents">
                        <span className="text-xs text-muted-foreground text-right">{i + 1}.</span>
                        <span
                          data-testid={`approval-name-${entry.playerId}`}
                          className={isRemoved ? "line-through text-muted-foreground" : undefined}
                        >
                          {name}
                        </span>
                        <button
                          type="button"
                          data-testid={`approval-remove-${entry.playerId}`}
                          aria-pressed={isRemoved}
                          aria-label={t(
                            isRemoved
                              ? "notificationsUi.replacementApproval.engine.restore"
                              : "notificationsUi.replacementApproval.engine.remove",
                            { name },
                          )}
                          disabled={!actionable || responding}
                          onClick={() => toggle(entry.playerId)}
                          className="justify-self-end rounded-full p-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
                        >
                          {isRemoved ? <Undo2 className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        </button>
                      </li>
                    );
                  })}
                </ol>
                {/* Rule 7a: the preview is never the invite set; say so whenever it is truncated. */}
                {hidden > 0 && (
                  <p className="text-[11px] text-muted-foreground" data-testid="approval-showing-of">
                    {t("notificationsUi.replacementApproval.showingOf", { shown: shown.length, total: type.queue.length })}
                  </p>
                )}
                {(hidden > 0 || isExpanded) && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    data-testid="approval-show-more"
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded((e) => ({ ...e, [index]: !isExpanded }))}
                  >
                    {isExpanded
                      ? t("notificationsUi.replacementApproval.showLess")
                      : t("notificationsUi.replacementApproval.showMore", { count: hidden })}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                <p className="text-xs italic text-muted-foreground">
                  {t("notificationsUi.replacementApproval.noEligiblePlayers")}
                </p>
                {/* N5: an empty type says why, in N6's words, one line per stage with its count. */}
                {reasons.length > 0 && (
                  <ul className="text-xs text-muted-foreground" data-testid="approval-empty-reasons">
                    {reasons.map((r) => (
                      <li key={r.stage} data-testid={`approval-empty-reason-${r.stage}`}>
                        {t("notificationsUi.replacementApproval.engine.reasonCount", { reason: resolveText(t, r.line), count: r.count })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}

      {outcome === "stale" ? (
        <p className="text-xs text-muted-foreground" data-testid="approval-replaced">
          {t("notificationsUi.replacementApproval.engine.replaced")}
        </p>
      ) : outcome === "approved" ? (
        <div className="flex">
          <span data-testid="approval-outcome" className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-success/15 text-success-strong">
            <Check className="w-3.5 h-3.5" />
            {t("notificationsUi.replacementApproval.approved")}
          </span>
        </div>
      ) : outcome === "dismissed" ? (
        <div className="flex">
          <span data-testid="approval-outcome" className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-destructive/15 text-destructive">
            <X className="w-3.5 h-3.5" />
            {t("notificationsUi.replacementApproval.engine.dismissed")}
          </span>
        </div>
      ) : actionable ? (
        // N2/N5: no "at the window" for a new-engine request; "Ignorar" only on the class's card.
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="approval-yes"
            onClick={() => respond("yes_now")}
            disabled={responding}
            className="flex-1 min-w-[7rem] py-1.5 px-3 text-sm font-medium rounded-xl bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
          >
            {responding ? "…" : t(yesLabel.key, yesLabel.params)}
          </button>
          {allowDismiss && (
            <button
              type="button"
              data-testid="approval-dismiss"
              onClick={() => respond("dismiss")}
              disabled={responding}
              className="flex-1 min-w-[4rem] py-1.5 px-3 text-sm font-medium rounded-xl bg-muted text-foreground disabled:opacity-50 transition-opacity"
            >
              {responding ? "…" : t("notificationsUi.replacementApproval.ignore")}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
