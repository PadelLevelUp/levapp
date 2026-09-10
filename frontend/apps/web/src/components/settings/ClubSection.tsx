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
import { ArrowDown, ArrowUp, Building2, Check, Copy, Loader2, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import type { Court } from "@/types";
import { createCourt, deleteCourt, listCourts, renameCourt, reorderCourts } from "@/api/courts";
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
  // clubs.courts rule 8 (PAD-194): the club's courts.
  const [courts, setCourts] = useState<Court[]>([]);
  const [newCourt, setNewCourt] = useState("");
  const [courtError, setCourtError] = useState<string | null>(null);
  const [courtBusy, setCourtBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
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

  useEffect(() => {
    if (!club) return;
    let cancelled = false;
    listCourts(club.id)
      .then((rows) => {
        if (!cancelled) setCourts(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [club]);

  const courtErrorFrom = (err: unknown) => {
    const data = (err as { response?: { status?: number; data?: { code?: string; error?: string } } }).response;
    if (data?.status === 400 && data.data?.code === "invalid_court") {
      return /already exists/i.test(data.data.error ?? "") ? t("settings.club.courts.duplicate") : t("settings.club.courts.invalid");
    }
    return t("settings.club.courts.saveFailed");
  };

  const handleAddCourt = async () => {
    if (!club) return;
    const name = newCourt.trim();
    if (!name || name.length > 80) {
      setCourtError(t("settings.club.courts.invalid"));
      return;
    }
    setCourtBusy(true);
    setCourtError(null);
    try {
      const created = await createCourt(club.id, name);
      setCourts((prev) => [...prev, created]);
      setNewCourt("");
    } catch (err) {
      setCourtError(courtErrorFrom(err));
    } finally {
      setCourtBusy(false);
    }
  };

  const handleRenameCourt = async (court: Court) => {
    const name = renameValue.trim();
    if (!name || name.length > 80) {
      setCourtError(t("settings.club.courts.invalid"));
      return;
    }
    setCourtBusy(true);
    setCourtError(null);
    try {
      const updated = await renameCourt(court.id, name);
      setCourts((prev) => prev.map((c) => (c.id === court.id ? updated : c)));
      setRenamingId(null);
    } catch (err) {
      setCourtError(courtErrorFrom(err));
    } finally {
      setCourtBusy(false);
    }
  };

  const handleMoveCourt = async (index: number, direction: -1 | 1) => {
    if (!club) return;
    const target = index + direction;
    if (target < 0 || target >= courts.length) return;
    const ids = courts.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setCourtBusy(true);
    setCourtError(null);
    try {
      setCourts(await reorderCourts(club.id, ids));
    } catch (err) {
      setCourtError(courtErrorFrom(err));
    } finally {
      setCourtBusy(false);
    }
  };

  const handleDeleteCourt = async (court: Court) => {
    setCourtBusy(true);
    setCourtError(null);
    try {
      await deleteCourt(court.id);
      setCourts((prev) => prev.filter((c) => c.id !== court.id));
    } catch {
      setCourtError(t("settings.club.courts.removeFailed"));
    } finally {
      setCourtBusy(false);
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

      {/* clubs.courts rule 8 (PAD-194): the club's courts, in order. */}
      <div className="space-y-3" data-testid="club-courts">
        <div>
          <h3 className="text-sm font-medium">{t("settings.club.courts.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("settings.club.courts.description")}</p>
        </div>

        {courts.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="club-courts-empty">
            {t("settings.club.courts.empty")}
          </p>
        )}

        <ul className="space-y-2">
          {courts.map((court, index) => (
            <li
              key={court.id}
              data-testid="club-court-row"
              className="flex items-center gap-2 rounded-lg border p-2 bg-background"
            >
              {renamingId === court.id ? (
                <>
                  <Input
                    value={renameValue}
                    aria-label={t("settings.club.courts.rename")}
                    data-testid="club-court-rename-input"
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void handleRenameCourt(court)}
                    className="h-8 flex-1 text-sm"
                    autoFocus
                  />
                  <Button size="sm" className="h-8" disabled={courtBusy} onClick={() => void handleRenameCourt(court)} data-testid="club-court-rename-save">
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" disabled={courtBusy} onClick={() => setRenamingId(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium" data-testid="club-court-name">{court.name}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("settings.club.courts.moveUp")} disabled={courtBusy || index === 0} onClick={() => void handleMoveCourt(index, -1)} data-testid="club-court-up">
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("settings.club.courts.moveDown")} disabled={courtBusy || index === courts.length - 1} onClick={() => void handleMoveCourt(index, 1)} data-testid="club-court-down">
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("settings.club.courts.rename")} disabled={courtBusy} onClick={() => { setRenamingId(court.id); setRenameValue(court.name); }} data-testid="club-court-rename">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={t("settings.club.courts.remove")} disabled={courtBusy} onClick={() => void handleDeleteCourt(court)} data-testid="club-court-remove">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Input
            value={newCourt}
            placeholder={t("settings.club.courts.namePlaceholder")}
            aria-label={t("settings.club.courts.add")}
            data-testid="club-court-new"
            onChange={(e) => { setNewCourt(e.target.value); setCourtError(null); }}
            onKeyDown={(e) => e.key === "Enter" && void handleAddCourt()}
            className="h-8 max-w-xs text-sm"
          />
          <Button size="sm" variant="outline" className="gap-2" disabled={courtBusy} onClick={() => void handleAddCourt()} data-testid="club-court-add">
            <Plus className="w-4 h-4" />
            {t("settings.club.courts.add")}
          </Button>
        </div>

        {courtError && (
          <p className="text-sm text-destructive" role="alert" data-testid="club-court-error">
            {courtError}
          </p>
        )}
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
