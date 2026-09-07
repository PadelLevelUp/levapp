import { playerClaimsApi } from "@levelup/api";
import type { CoachPlayer } from "@levelup/types";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
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
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { coachPlayersKey } from "@/features/players/hooks";

/**
 * players.claim rule 4 (trigger B) on iOS — "Link to existing account" for a
 * claimable player. The coach types the student's exact username; the student
 * confirms from their own app before anything is merged. Twin of web's
 * ClaimLinkAction.
 */
export function ClaimLinkAction({ player }: { player: CoachPlayer }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [username, setUsername] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  if (!player.claimable) return null;

  const submit = async () => {
    const value = username.trim();
    if (!value) return;
    setSubmitting(true);
    setError(null);
    try {
      await playerClaimsApi.createClaimRequest(player.playerId, value);
      void queryClient.invalidateQueries({ queryKey: coachPlayersKey });
      setPending(true);
      setOpen(false);
      toast.success(t("players.claim.requestSent"));
    } catch (err: any) {
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

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        testID="player-claim-link"
        accessibilityLabel={t("players.claim.linkAction")}
        onPress={() => setOpen(true)}
      >
        <Text>{t("players.claim.linkAction")}</Text>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent testID="player-claim-dialog">
          <DialogHeader>
            <DialogTitle>{t("players.claim.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("players.claim.dialogDescription")}</DialogDescription>
          </DialogHeader>
          <View className="gap-2">
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
            {error ? (
              <Text className="text-sm text-destructive" testID="player-claim-error">
                {error}
              </Text>
            ) : null}
          </View>
          <DialogFooter>
            <Button
              testID="player-claim-submit"
              disabled={submitting || !username.trim()}
              onPress={() => void submit()}
            >
              <Text>{submitting ? t("players.claim.submitting") : t("players.claim.submit")}</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
