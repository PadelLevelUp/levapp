import * as React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { useCoachLevels } from "@levelup/hooks";
import { useRouter } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";
import { WEB_APP_URL } from "@/lib/config";
import { useAddPlayer, useCreateIncompletePlayer } from "@/features/players/hooks";
import { PlayerForm, type PlayerFormValues } from "@/features/players/PlayerForm";

export default function NewPlayerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: levels } = useCoachLevels();
  const addPlayer = useAddPlayer();
  const createIncompletePlayer = useCreateIncompletePlayer();
  const [error, setError] = React.useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = React.useState(false);

  const handleSubmit = async (values: PlayerFormValues) => {
    setError(null);
    try {
      // Payload mirrors the web AddPlayerSheet: coach_id + isActive required.
      await addPlayer.mutateAsync({
        coachId: user?.coachId,
        name: values.name,
        isActive: true,
        email: values.email || undefined,
        phone: values.phone || undefined,
        levelId: values.levelId,
        side: values.side,
        notes: values.notes || undefined,
      });
      router.back();
    } catch {
      setError(t("players.createFailed"));
    }
  };

  /**
   * PAD-135: the invite counterpart of handleSubmit, mirroring web's
   * PlayersPage.handleInvitePlayer. Unlike handleSubmit this deliberately
   * does NOT router.back() on success — the invite link is the whole point of
   * the action, and popping the screen would unmount the dialog before the
   * coach could read it. Navigation happens when the dialog is dismissed.
   */
  const handleInvite = async (values: PlayerFormValues) => {
    setError(null);
    try {
      const created = await createIncompletePlayer.mutateAsync({
        // `?? undefined`: AuthContext types coachId as string | null, while the
        // invite payload accepts string | number | undefined. The backend
        // ignores this field anyway since PAD-92 (the invitation is always
        // issued by the calling coach) — it is kept for payload compatibility.
        coachId: user?.coachId ?? undefined,
        name: values.name,
        email: values.email || undefined,
        levelId: values.levelId,
        side: values.side,
        notes: values.notes || undefined,
      });
      // The API returns a RELATIVE link ("/invite/player/<token>"); mobile has
      // no window.location to resolve it against, so we prefix the configured
      // public web origin — the link is opened on the web app either way.
      setInviteUrl(`${WEB_APP_URL}${created.inviteLink}`);
      setInviteDialogOpen(true);
    } catch {
      setError("Failed to create the invite. Please try again.");
    }
  };

  const handleInviteDialogChange = (open: boolean) => {
    setInviteDialogOpen(open);
    // The player was created either way — leaving the coach on an empty
    // create form would invite an accidental duplicate.
    if (!open) router.back();
  };

  return (
    <Screen edges={["top"]} testID="screen-player-new">
      <View className="flex-row items-center gap-1 border-b border-border px-2 py-2">
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel={t("common.goBack")}
          onPress={() => router.back()}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={lightTheme.foreground}
          />
        </Button>
        <Text role="heading" aria-level={1} className="text-xl font-bold">
          {t("players.newPlayer")}
        </Text>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >
        <PlayerForm
          levels={levels ?? []}
          coachId={user?.coachId}
          submitLabel={t("players.createPlayer")}
          saving={addPlayer.isPending}
          inviting={createIncompletePlayer.isPending}
          onSubmit={handleSubmit}
          onInvite={handleInvite}
          onCancel={() => router.back()}
        />
        {error ? (
          <Text className="mt-3 text-sm text-destructive">{error}</Text>
        ) : null}
      </ScrollView>

      <Dialog open={inviteDialogOpen} onOpenChange={handleInviteDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("players.inviteDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("players.inviteDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          {/* No clipboard dependency on mobile (web's copy button uses
              navigator.clipboard). Selectable text gives the coach the OS
              long-press "Copy" menu — same precedent as the coach-invite
              dialog in settings/club-section.tsx. */}
          <View
            className="rounded-md border border-input bg-background px-3 py-3"
            testID="player-invite-link"
          >
            <Text selectable className="text-sm text-foreground">
              {inviteUrl ?? ""}
            </Text>
          </View>
        </DialogContent>
      </Dialog>
    </Screen>
  );
}
