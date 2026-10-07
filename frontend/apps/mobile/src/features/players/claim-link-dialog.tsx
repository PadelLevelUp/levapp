import { playerClaimsApi } from "@levelup/api";
import { describeMergePlan } from "@levelup/config";
import type { CoachPlayer } from "@levelup/types";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
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
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { coachPlayersKey } from "@/features/players/hooks";

type Tab = "roster" | "username";

/**
 * players.claim rule 4 (trigger B) on iOS — "Link to existing account" for a
 * claimable player. Rule 4b (PAD-528): the coach picks the student from their
 * own roster (the one who scanned the QR first) or types the exact username;
 * the student confirms from their own app before anything is merged (rule 4d).
 * Rule 4c: a flagged duplicate gets a one-tap "Merge into {name}" that opens
 * the sheet preselected, with rule 5j's dry run shown. Twin of web's
 * ClaimLinkAction.
 */
export function ClaimLinkAction({ player }: { player: CoachPlayer }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("roster");
  const [username, setUsername] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [candidates, setCandidates] = React.useState<playerClaimsApi.ClaimCandidate[] | null>(null);
  const [targetId, setTargetId] = React.useState<string | number | null>(null);
  const [preview, setPreview] = React.useState<playerClaimsApi.MergePreview | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const duplicate = player.possibleDuplicateOf ?? null;

  React.useEffect(() => {
    if (!open || tab !== "roster") return;
    let cancelled = false;
    playerClaimsApi
      .listClaimCandidates(player.playerId, search.trim() || undefined)
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

  React.useEffect(() => {
    if (!open || targetId === null) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    playerClaimsApi
      .previewMergeForCoach(player.playerId, targetId)
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
      setOpen(false);
      toast.error(
        code === "ALREADY_ACTIVATED"
          ? t("players.claim.alreadyActivated")
          : t("players.claim.alreadyPending")
      );
      if (code !== "ALREADY_ACTIVATED") setPending(true);
    } else {
      setError(t("players.claim.failed"));
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (tab === "roster") {
        if (targetId === null) return;
        await playerClaimsApi.createClaimRequestByPick(player.playerId, targetId);
      } else {
        const value = username.trim();
        if (!value) return;
        await playerClaimsApi.createClaimRequest(player.playerId, value);
      }
      void queryClient.invalidateQueries({ queryKey: coachPlayersKey });
      setPending(true);
      setOpen(false);
      toast.success(t("players.claim.requestSent"));
    } catch (err: any) {
      fail(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (pending) {
    return (
      <View className="rounded-md border border-border bg-muted p-3" testID="player-claim-pending">
        <Text className="text-sm font-semibold">{t("players.claim.pending")}</Text>
        <Text className="text-sm text-muted-foreground">{t("players.claim.pendingHint")}</Text>
      </View>
    );
  }

  const canSubmit = tab === "roster" ? targetId !== null : Boolean(username.trim());
  const described = describeMergePlan(preview, t, "theirs");

  return (
    <>
      {duplicate ? (
        <View className="gap-2 rounded-md border border-warning/40 bg-warning/5 p-3" testID="player-duplicate-hint">
          <Text className="text-sm">{t("players.claim.possibleDuplicateHint", { name: duplicate.name })}</Text>
          <Button
            size="sm"
            testID="player-claim-merge-into"
            accessibilityLabel={t("players.claim.mergeInto", { name: duplicate.name })}
            onPress={() => openWith(duplicate.playerId)}
          >
            <Text>{t("players.claim.mergeInto", { name: duplicate.name })}</Text>
          </Button>
        </View>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        testID="player-claim-link"
        accessibilityLabel={t("players.claim.linkAction")}
        onPress={() => openWith(null)}
      >
        <Text>{t("players.claim.linkAction")}</Text>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent testID="player-claim-dialog">
          <DialogHeader>
            <DialogTitle>{t("players.claim.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("players.claim.rosterHint")}</DialogDescription>
          </DialogHeader>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="w-full flex-row">
              <TabsTrigger value="roster" className="flex-1" testID="player-claim-tab-roster">
                <Text>{t("players.claim.tabRoster")}</Text>
              </TabsTrigger>
              <TabsTrigger value="username" className="flex-1" testID="player-claim-tab-username">
                <Text>{t("players.claim.tabUsername")}</Text>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="roster" className="gap-2">
              <Input
                testID="player-claim-search"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t("players.claim.searchRoster")}
                value={search}
                onChangeText={setSearch}
              />
              <ScrollView className="max-h-56" testID="player-claim-candidates">
                {candidates === null ? (
                  <Text className="p-2 text-sm text-muted-foreground">{t("players.claim.previewLoading")}</Text>
                ) : candidates.length === 0 ? (
                  <Text className="p-2 text-sm text-muted-foreground">{t("players.claim.noCandidates")}</Text>
                ) : (
                  candidates.map((c) => {
                    const selected = String(c.playerId) === String(targetId);
                    return (
                      <Pressable
                        key={String(c.playerId)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={c.name}
                        testID={`player-claim-candidate-${c.playerId}`}
                        onPress={() => setTargetId(c.playerId)}
                        className={`mb-1 flex-row items-center justify-between rounded-md border px-3 py-2 ${
                          selected ? "border-primary bg-primary/5" : "border-border"
                        }`}
                      >
                        <View className="flex-row items-center gap-2">
                          <Text className="text-sm font-medium">{c.name}</Text>
                          {c.levelLabel ? <Text className="text-sm text-muted-foreground">{c.levelLabel}</Text> : null}
                        </View>
                        {c.sameName ? <Text className="text-xs text-warning">{t("players.claim.sameName")}</Text> : null}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
              {targetId !== null ? (
                <View className="rounded-md bg-muted p-3" testID="player-claim-preview">
                  {previewLoading ? (
                    <Text className="text-sm text-muted-foreground">{t("players.claim.previewLoading")}</Text>
                  ) : (
                    <>
                      <Text className="text-sm">{described.moves ?? t("players.claim.previewNothing")}</Text>
                      {described.kept ? <Text className="text-sm">{described.kept}</Text> : null}
                      <Text className="mt-1 text-sm font-semibold">{t("players.claim.previewIrreversible")}</Text>
                    </>
                  )}
                </View>
              ) : null}
            </TabsContent>
            <TabsContent value="username" className="gap-2">
              <Text className="text-sm text-muted-foreground">{t("players.claim.dialogDescription")}</Text>
              <Label nativeID="player-claim-username-label">{t("players.claim.usernameLabel")}</Label>
              <Input
                testID="player-claim-username"
                accessibilityLabelledBy="player-claim-username-label"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                placeholder={t("players.claim.usernamePlaceholder")}
                value={username}
                onChangeText={(v) => {
                  setUsername(v);
                  setError(null);
                }}
              />
            </TabsContent>
          </Tabs>
          {error ? (
            <Text className="text-sm text-destructive" testID="player-claim-error">
              {error}
            </Text>
          ) : null}
          <DialogFooter>
            <Button testID="player-claim-submit" disabled={submitting || !canSubmit} onPress={() => void submit()}>
              <Text>{submitting ? t("players.claim.submitting") : t("players.claim.submit")}</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
