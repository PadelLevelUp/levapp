/**
 * dashboard.profile-completeness rules 4, 6 and 7 (PAD-490): a student whose coach has not set
 * their level or side learns what that costs and may remind the coach once per club day. The
 * server enforces the limit; the button mirrors `remindedToday`.
 */
import type { DashboardProfileIncompleteBlock } from "@levelup/types";
import { dashboardApi } from "@levelup/api";
import { profileIncompleteBodyKey } from "@levelup/config";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ActionCard } from "./coach/primitives";

export function ProfileIncompleteBlock({
  block,
  onReminded,
}: {
  block: DashboardProfileIncompleteBlock;
  onReminded?: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [sending, setSending] = useState<number | null>(null);
  const [sentNow, setSentNow] = useState<Set<number>>(new Set());
  const [failed, setFailed] = useState<number | null>(null);

  const remind = async (coachId: number) => {
    setSending(coachId);
    setFailed(null);
    try {
      await dashboardApi.sendProfileReminder(coachId);
      setSentNow((prev) => new Set(prev).add(coachId));
      await onReminded?.();
    } catch (error) {
      const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
      // Already reminded today (another tab, another device): the server is the truth.
      if (code === "already_reminded") setSentNow((prev) => new Set(prev).add(coachId));
      else setFailed(coachId);
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="dashboard-profile-incomplete">
      {block.data.coaches.map((c) => {
        const reminded = c.remindedToday || sentNow.has(c.coachId);
        return (
          <ActionCard key={c.coachId} accent="attention" testId={`profile-incomplete-${c.coachId}`}>
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-base font-semibold">{t("dashboard.profileCompleteness.studentTitle")}</h2>
              <p className="text-sm text-muted-foreground" data-testid={`profile-incomplete-body-${c.coachId}`}>
                {t(profileIncompleteBodyKey(c.missing))}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("dashboard.profileCompleteness.studentCoach", { name: c.coachName })}
                </span>
                {/* #523: no button for a blocked pair; the card still explains the cost. */}
                {c.canRemind !== false && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reminded || sending === c.coachId}
                    data-testid={`profile-incomplete-remind-${c.coachId}`}
                    data-reminded={reminded ? "true" : "false"}
                    onClick={() => void remind(c.coachId)}
                  >
                    {t(reminded ? "dashboard.profileCompleteness.reminded" : "dashboard.profileCompleteness.remind")}
                  </Button>
                )}
              </div>
              {failed === c.coachId && (
                <p className="text-sm text-destructive" role="alert">
                  {t("dashboard.profileCompleteness.remindFailed")}
                </p>
              )}
            </div>
          </ActionCard>
        );
      })}
    </div>
  );
}
