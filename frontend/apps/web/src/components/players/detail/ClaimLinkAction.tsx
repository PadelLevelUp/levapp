import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitMerge, Link2, Loader2 } from "lucide-react";
import type { CoachPlayer } from "@/types";
import { describeMergePlan } from "@levelup/config";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  createClaimRequest,
  createClaimRequestByPick,
  listClaimCandidates,
  previewMergeForCoach,
  type ClaimCandidate,
  type MergePreview,
} from "@/api/playerClaims";

/**
 * players.claim rule 4 (trigger B) — "Link to existing account" on a
 * claimable player. Two ways to name the student (rule 4b, PAD-528): pick them
 * from the coach's own roster (the student who scanned the QR before the coach
 * could link them), or type their exact username. Either way the student
 * confirms from their own app before anything is merged (rule 4d).
 *
 * Rule 4c: when the roster already flagged a likely duplicate, a one-tap
 * "Merge into {name}" opens the dialog with that student preselected, and
 * rule 5j's dry run is shown before the request goes out.
 */
export function ClaimLinkAction({ player }: { player: CoachPlayer }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"roster" | "username">("roster");
  const [username, setUsername] = useState("");
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<ClaimCandidate[] | null>(null);
  const [targetId, setTargetId] = useState<string | number | null>(null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(false);
  const duplicate = player.possibleDuplicateOf ?? null;

  useEffect(() => {
    if (!open || tab !== "roster") return;
    let cancelled = false;
    listClaimCandidates(player.playerId, search.trim() || undefined)
      .then((rows) => {
        if (!cancelled) setCandidates(rows);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, search, player.playerId]);

  useEffect(() => {
    if (!open || targetId === null) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    previewMergeForCoach(player.playerId, targetId)
      .then((plan) => {
        if (!cancelled) setPreview(plan);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, targetId, player.playerId]);

  if (!player.claimable) return null;

  const openWith = (preselect: string | number | null) => {
    setTab("roster");
    setTargetId(preselect);
    setSearch("");
    setError(null);
    setOpen(true);
  };

  const fail = (err: any) => {
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
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (tab === "roster") {
        if (targetId === null) return;
        await createClaimRequestByPick(player.playerId, targetId);
      } else {
        const value = username.trim();
        if (!value) return;
        await createClaimRequest(player.playerId, value);
      }
      setPending(true);
      setOpen(false);
      toast({ title: t("players.claim.requestSent") });
    } catch (err: any) {
      fail(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (pending) {
    return (
      <div className="rounded-md border bg-muted p-3 text-sm" data-testid="player-claim-pending">
        <p className="font-medium">{t("players.claim.pending")}</p>
        <p className="text-muted-foreground">{t("players.claim.pendingHint")}</p>
      </div>
    );
  }

  const canSubmit = tab === "roster" ? targetId !== null : Boolean(username.trim());
  const described = describeMergePlan(preview, t, "theirs");

  return (
    <>
      {duplicate && (
        <div
          className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm"
          data-testid="player-duplicate-hint"
        >
          <p>{t("players.claim.possibleDuplicateHint", { name: duplicate.name })}</p>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => openWith(duplicate.playerId)}
            data-testid="player-claim-merge-into"
          >
            <GitMerge className="mr-2 h-4 w-4" />
            {t("players.claim.mergeInto", { name: duplicate.name })}
          </Button>
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => openWith(null)}
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
              <DialogDescription>{t("players.claim.rosterHint")}</DialogDescription>
            </DialogHeader>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "roster" | "username")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="roster" data-testid="player-claim-tab-roster">
                  {t("players.claim.tabRoster")}
                </TabsTrigger>
                <TabsTrigger value="username" data-testid="player-claim-tab-username">
                  {t("players.claim.tabUsername")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="roster" className="space-y-2">
                <Input
                  data-testid="player-claim-search"
                  autoComplete="off"
                  placeholder={t("players.claim.searchRoster")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div
                  role="radiogroup"
                  aria-label={t("players.claim.tabRoster")}
                  className="max-h-56 space-y-1 overflow-y-auto"
                  data-testid="player-claim-candidates"
                >
                  {candidates === null ? (
                    <p className="p-2 text-sm text-muted-foreground">{t("players.claim.previewLoading")}</p>
                  ) : candidates.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground">{t("players.claim.noCandidates")}</p>
                  ) : (
                    candidates.map((c) => {
                      const selected = String(c.playerId) === String(targetId);
                      return (
                        <button
                          key={String(c.playerId)}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setTargetId(c.playerId)}
                          data-testid={`player-claim-candidate-${c.playerId}`}
                          className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${
                            selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                          }`}
                        >
                          <span>
                            <span className="font-medium">{c.name}</span>
                            {c.levelLabel && <span className="ml-2 text-muted-foreground">{c.levelLabel}</span>}
                          </span>
                          {c.sameName && (
                            <span className="text-xs text-warning">{t("players.claim.sameName")}</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
                {targetId !== null && (
                  <div className="rounded-md bg-muted p-3 text-sm" data-testid="player-claim-preview">
                    {previewLoading ? (
                      <p className="text-muted-foreground">{t("players.claim.previewLoading")}</p>
                    ) : (
                      <>
                        <p>{described.moves ?? t("players.claim.previewNothing")}</p>
                        {described.kept && <p>{described.kept}</p>}
                        <p className="mt-1 font-medium">{t("players.claim.previewIrreversible")}</p>
                      </>
                    )}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="username" className="space-y-2">
                <p className="text-sm text-muted-foreground">{t("players.claim.dialogDescription")}</p>
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
              </TabsContent>
            </Tabs>
            {error && (
              <p className="text-sm text-destructive" data-testid="player-claim-error">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={submitting || !canSubmit} data-testid="player-claim-submit">
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
