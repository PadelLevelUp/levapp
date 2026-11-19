import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, UserPlus, AlertTriangle } from "lucide-react";
import { missingSetup, missingSetupKey, pendingAgeDays } from "@levelup/config";
import type { CoachPlayer } from "@/types";
import { activationLinkPath } from "@/api/register";
import { publicWebLink, usePublicWebOrigin } from "@/lib/publicWebLink";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ClaimLinkAction } from "@/components/players/detail/ClaimLinkAction";

interface PlayerStateAlertsProps {
  player: CoachPlayer;
  /** Opens Block 1 in the "Completar informação" session (players.profile rule 9). */
  onComplete: () => void;
  /** True while the header or Block 1 is in edit mode (rule 8: never two edits at once). */
  completeDisabled?: boolean;
}

/**
 * players.profile rules 9 and 11 (PAD-834): the two alerts above the blocks. Pending registration
 * comes first; needs-configuring holds no selects, only the way into Block 1.
 */
export function PlayerStateAlerts({ player, onComplete, completeDisabled = false }: PlayerStateAlertsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const webOrigin = usePublicWebOrigin() ?? "";

  const pending = player.pendingRegistration === true;
  const missing = missingSetup(player);
  const missingKey = missingSetupKey(missing);
  const age = pending ? pendingAgeDays(player.addedAt) : null;

  // auth.activate rules 2-3 (PAD-254): the activation link carries the account's secret; it is the
  // link whichever flow created the player (assumption Q6). PAD-595: on the public origin.
  const inviteLink = player.activationToken
    ? publicWebLink(webOrigin, activationLinkPath(player.userId, player.activationToken))
    : publicWebLink(webOrigin, `/register/${player.userId || "player"}`);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast({ title: t("players.card.linkCopied") });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: "destructive", title: t("players.linkCopyFailed") });
    }
  };

  if (!pending && !missingKey) return null;

  return (
    <div className="space-y-3">
      {pending && (
        <div
          className="rounded-lg border border-violet-300 bg-violet-50 p-4 space-y-3 dark:border-violet-800 dark:bg-violet-950/40"
          data-testid="player-pending-alert"
          data-tone="pending"
          role="status"
        >
          <div className="flex gap-2">
            <UserPlus className="h-4 w-4 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("players.card.pendingTitle")}</p>
              {age !== null && (
                <p className="text-sm text-muted-foreground" data-testid="player-pending-age" data-days={age}>
                  {age === 0 ? t("players.card.addedToday") : t("players.card.addedAgo", { count: age })}
                </p>
              )}
              <p className="text-sm text-muted-foreground">{t("players.card.pendingBody")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} data-testid="player-copy-invite-link">
              {copied ? <Check className="mr-2 h-4 w-4 text-primary" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? t("players.card.linkCopied") : t("players.card.copyInviteLink")}
            </Button>
          </div>
          {/* players.claim rule 4: linking this record to an account the student made on their own.
              It links records; it does not invite. Only while still claimable. */}
          <ClaimLinkAction player={player} />
        </div>
      )}

      {missingKey && (
        <div
          className="rounded-lg border border-warning/40 bg-warning/10 p-4 flex flex-wrap items-center gap-3"
          data-testid="player-needs-config-alert"
          data-tone="warning"
          data-missing={missing.join(",")}
          role="status"
        >
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{t("players.card.needsConfigTitle")}</p>
            <p className="text-sm text-warning-strong">{t(missingKey)}</p>
          </div>
          <Button size="sm" onClick={onComplete} disabled={completeDisabled} data-testid="player-needs-config-complete">
            {t("players.card.completeInfo")}
          </Button>
        </div>
      )}
    </div>
  );
}
