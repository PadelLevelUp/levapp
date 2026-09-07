import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  acceptClaimRequest,
  listMyClaimRequests,
  rejectClaimRequest,
  type PlayerClaimRequest,
} from "@/api/playerClaims";
import { cn } from "@/lib/utils";

/**
 * players.claim rule 4 — the student's inbox of pending link requests: a coach
 * created a record for them and wants it folded into this account. Rendered as
 * a dashboard banner and as a Settings → Account list; the same data and the
 * same two actions, so the two surfaces can never disagree.
 *
 * `onAccepted` lets the host refetch whatever the merge changed (the dashboard
 * blocks, the roster) — after an accept every payload that pointed at the
 * placeholder now points at this account (rule 6).
 */
export function ClaimRequestsList({
  variant,
  onAccepted,
}: {
  variant: "banner" | "list";
  onAccepted?: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [requests, setRequests] = useState<PlayerClaimRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRequests(await listMyClaimRequests());
    } catch {
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (req: PlayerClaimRequest, accept: boolean) => {
    setBusyId(req.id);
    try {
      if (accept) {
        await acceptClaimRequest(req.id);
        toast({ title: t("players.claim.accepted") });
      } else {
        await rejectClaimRequest(req.id);
        toast({ title: t("players.claim.rejected") });
      }
      setRequests((prev) => (prev ?? []).filter((r) => r.id !== req.id));
      if (accept) onAccepted?.();
    } catch {
      toast({ title: t("players.claim.actionFailed"), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const describe = (req: PlayerClaimRequest) =>
    req.clubName
      ? t("players.claim.bannerText", {
          coachName: req.coachName,
          clubName: req.clubName,
          placeholderName: req.placeholderName,
        })
      : t("players.claim.bannerTextNoClub", {
          coachName: req.coachName,
          placeholderName: req.placeholderName,
        });

  if (variant === "banner") {
    if (!requests || requests.length === 0) return null;
    return (
      <div
        className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4"
        data-testid="claim-request-banner"
      >
        <div className="flex items-start gap-2">
          <Link2 className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium">{t("players.claim.bannerTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("players.claim.bannerHint")}</p>
          </div>
        </div>
        {requests.map((req) => (
          <ClaimRequestRow
            key={req.id}
            req={req}
            text={describe(req)}
            busy={busyId === req.id}
            onAccept={() => decide(req, true)}
            onReject={() => decide(req, false)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="settings-claim-requests">
      <div>
        <p className="text-sm font-medium">{t("players.claim.settingsTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("players.claim.settingsDescription")}</p>
      </div>
      {requests === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="settings-claim-requests-empty">
          {t("players.claim.settingsEmpty")}
        </p>
      ) : (
        requests.map((req) => (
          <ClaimRequestRow
            key={req.id}
            req={req}
            text={describe(req)}
            busy={busyId === req.id}
            onAccept={() => decide(req, true)}
            onReject={() => decide(req, false)}
          />
        ))
      )}
    </div>
  );
}

function ClaimRequestRow({
  req,
  text,
  busy,
  onAccept,
  onReject,
}: {
  req: PlayerClaimRequest;
  text: string;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
      )}
      data-testid={`claim-request-${req.id}`}
    >
      <p className="text-sm">{text}</p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" onClick={onAccept} disabled={busy} data-testid={`claim-accept-${req.id}`}>
          {busy ? t("players.claim.working") : t("players.claim.accept")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onReject}
          disabled={busy}
          data-testid={`claim-reject-${req.id}`}
        >
          {t("players.claim.reject")}
        </Button>
      </div>
    </div>
  );
}
