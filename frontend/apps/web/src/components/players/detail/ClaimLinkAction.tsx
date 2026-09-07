import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Loader2 } from "lucide-react";
import type { CoachPlayer } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { createClaimRequest } from "@/api/playerClaims";

/**
 * players.claim rule 4 (trigger B) — "Link to existing account" on a
 * claimable player: the coach types the student's exact username and the
 * student confirms from their own app before anything is merged.
 *
 * Exact match only, no search — a coach must already know the username, which
 * is the consent signal the decision (2026-09-06, item 4) relies on.
 */
export function ClaimLinkAction({ player }: { player: CoachPlayer }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(false);

  if (!player.claimable) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = username.trim();
    if (!value) return;
    setSubmitting(true);
    setError(null);
    try {
      await createClaimRequest(player.playerId, value);
      setPending(true);
      setOpen(false);
      toast({ title: t("players.claim.requestSent") });
    } catch (err: any) {
      const status = err?.response?.status;
      const code = err?.response?.data?.error;
      if (status === 404) {
        setError(t("players.claim.notFound"));
      } else if (status === 409) {
        // 409 covers both "already pending" and ALREADY_ACTIVATED; the body
        // says which. Both are told as a toast — neither is a typo to fix.
        setOpen(false);
        toast({
          title:
            code === "ALREADY_ACTIVATED"
              ? t("players.claim.alreadyActivated")
              : t("players.claim.alreadyPending"),
          variant: "destructive",
        });
        if (code !== "ALREADY_ACTIVATED") setPending(true);
      } else {
        setError(t("players.claim.failed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (pending) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm" data-testid="player-claim-pending">
        <p className="font-medium">{t("players.claim.pending")}</p>
        <p className="text-muted-foreground">{t("players.claim.pendingHint")}</p>
      </div>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="player-claim-link"
      >
        <Link2 className="mr-2 h-4 w-4" />
        {t("players.claim.linkAction")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="player-claim-dialog">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("players.claim.dialogTitle")}</DialogTitle>
              <DialogDescription>{t("players.claim.dialogDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="player-claim-username">{t("players.claim.usernameLabel")}</Label>
              <Input
                id="player-claim-username"
                data-testid="player-claim-username"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={t("players.claim.usernamePlaceholder")}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
              />
              {error && (
                <p className="text-sm text-destructive" data-testid="player-claim-error">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting || !username.trim()} data-testid="player-claim-submit">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("players.claim.submitting")}
                  </>
                ) : (
                  t("players.claim.submit")
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
