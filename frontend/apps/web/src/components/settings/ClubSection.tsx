import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Check, Copy, Loader2, UserPlus, X } from "lucide-react";
import {
  type CoachClub,
  type PendingCoachInvitation,
  createCoachInvitation,
  getCoachClub,
  listCoachInvitations,
  revokeCoachInvitation,
} from "@/api/invitations";
import {
  type ClubJoinRequest,
  approveClubJoinRequest,
  listClubJoinRequests,
  rejectClubJoinRequest,
} from "@/api/clubs";

/**
 * Coach club section: the current club, co-coach invitations (member acts
 * first) and — clubs.join-request rule 9 — the join requests from coaches who
 * asked to come in (newcomer acts first). `onJoinRequestCountChange` feeds the
 * badge on the Club entry of the Settings nav.
 */
export function ClubSection({
  onJoinRequestCountChange,
}: {
  onJoinRequestCountChange?: (n: number) => void;
}) {
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const [joinRequests, setJoinRequests] = useState<ClubJoinRequest[]>([]);
  const [decidingId, setDecidingId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [club, setClub] = useState<CoachClub | null>(null);
  const [invitations, setInvitations] = useState<PendingCoachInvitation[]>([]);

  const [creating, setCreating] = useState(false);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const refreshInvitations = useCallback(async (clubId: number) => {
    try {
      const data = await listCoachInvitations(clubId);
      setInvitations(data);
    } catch {
      // Non-fatal — keep the current list
    }
  }, []);

  const refreshJoinRequests = useCallback(
    async (clubId: number) => {
      try {
        const rows = await listClubJoinRequests(clubId);
        setJoinRequests(rows);
        onJoinRequestCountChange?.(rows.length);
      } catch {
        toast({ variant: "destructive", title: t("settings.club.joinRequests.loadFailed") });
      }
    },
    [onJoinRequestCountChange, t, toast]
  );

  useEffect(() => {
    let cancelled = false;

    getCoachClub()
      .then(async (c) => {
        if (cancelled) return;
        setClub(c);
        if (c) {
          await Promise.all([refreshInvitations(c.id), refreshJoinRequests(c.id)]);
        }
      })
      .catch(() => {
        if (!cancelled) setClub(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshInvitations, refreshJoinRequests]);

  const handleDecide = async (req: ClubJoinRequest, approve: boolean) => {
    if (!club) return;
    setDecidingId(req.id);
    try {
      if (approve) {
        await approveClubJoinRequest(req.id);
        toast({ title: t("settings.club.joinRequests.approved", { name: req.coachName }) });
      } else {
        await rejectClubJoinRequest(req.id);
        toast({ title: t("settings.club.joinRequests.declined", { name: req.coachName }) });
      }
      await refreshJoinRequests(club.id);
    } catch {
      toast({ variant: "destructive", title: t("settings.club.joinRequests.actionFailed") });
    } finally {
      setDecidingId(null);
    }
  };

  const handleInviteCoach = async () => {
    if (!club) return;
    setCreating(true);
    try {
      const created = await createCoachInvitation(club.id);
      setInviteUrl(`${window.location.origin}${created.inviteLink}`);
      setInviteDialogOpen(true);
      await refreshInvitations(club.id);
    } catch {
      toast({
        variant: "destructive",
        title: t("settings.club.createInvitationFailed"),
        description: t("settings.club.createInvitationFailedDescription"),
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast({ title: t("settings.club.linkCopied") });
    } catch {
      toast({ variant: "destructive", title: t("settings.club.copyFailed") });
    }
  };

  const handleRevoke = async (token: string) => {
    if (!club) return;
    setRevokingToken(token);
    try {
      await revokeCoachInvitation(token);
      await refreshInvitations(club.id);
      toast({ title: t("settings.club.invitationRevoked") });
    } catch {
      toast({ variant: "destructive", title: t("settings.club.revokeFailed") });
    } finally {
      setRevokingToken(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (!club) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Building2 className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {t("settings.club.noClub")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-muted-foreground" />
          <div>
            <p className="font-medium">{club.name}</p>
            <p className="text-sm text-muted-foreground">{t("settings.club.currentClub")}</p>
          </div>
        </div>
        <Button onClick={handleInviteCoach} disabled={creating}>
          {creating ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <UserPlus className="w-4 h-4 mr-2" />
          )}
          {t("settings.club.inviteCoach")}
        </Button>
      </div>

      <Separator />

      {/* clubs.join-request rule 9: coaches asking to come in. */}
      <div className="space-y-3" data-testid="club-join-requests">
        <div>
          <p className="text-sm font-medium">{t("settings.club.joinRequests.title")}</p>
          <p className="text-xs text-muted-foreground">{t("settings.club.joinRequests.description")}</p>
        </div>
        {joinRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="club-join-requests-empty">
            {t("settings.club.joinRequests.empty")}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {joinRequests.map((req) => (
              <li
                key={req.id}
                className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`club-join-request-${req.id}`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{req.coachName}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.club.joinRequests.requestedAt", {
                      date: new Date(req.requestedAt).toLocaleDateString(i18n.language),
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    className="gap-1"
                    disabled={decidingId === req.id}
                    onClick={() => void handleDecide(req, true)}
                    data-testid={`club-join-approve-${req.id}`}
                  >
                    {decidingId === req.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {t("settings.club.joinRequests.approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={decidingId === req.id}
                    onClick={() => void handleDecide(req, false)}
                    data-testid={`club-join-decline-${req.id}`}
                  >
                    <X className="h-4 w-4" />
                    {t("settings.club.joinRequests.decline")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <p className="text-sm font-medium">{t("settings.club.pendingInvitations")}</p>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("settings.club.noPendingInvitations")}
          </p>
        ) : (
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div
                key={inv.token}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {inv.email || t("settings.club.shareableLink")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.club.expires", { date: new Date(inv.expiresAt).toLocaleDateString() })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevoke(inv.token)}
                  disabled={revokingToken === inv.token}
                  aria-label={t("settings.club.revokeInvitation")}
                >
                  {revokingToken === inv.token ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <X className="w-4 h-4 mr-1" />
                  )}
                  {t("settings.club.revoke")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.club.inviteDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.club.inviteDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={inviteUrl ?? ""} />
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
              aria-label={t("settings.club.copyInviteLink")}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
