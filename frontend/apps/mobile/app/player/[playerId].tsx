import * as React from "react";
import type { PlayerRemovalImpact } from "@levelup/types";
import { playersApi } from "@levelup/api";
import { Platform, ScrollView, Share, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { lightTheme } from "@levelup/config";
import { useCoachLevels, usePlayerProfile } from "@levelup/hooks";
import { SIDE_LABEL_KEYS } from "@levelup/types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { WEB_APP_URL } from "@/lib/config";
import { useDateLocale } from "@/lib/date-locale";
import { registerLink } from "@/lib/web-links";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { AddEvaluationForm } from "@/features/players/add-evaluation-form";
import { AddToClassesDialog } from "@/features/players/add-to-classes-dialog";
import { ClaimLinkAction } from "@/features/players/claim-link-dialog";
import {
  useCoachPlayers,
  useEditPlayer,
  useRemoveFromStandingWaitingList,
  useRemovePlayer,
  useStandingWaitingList,
} from "@/features/players/hooks";
import { LevelLabel } from "@/features/players/LevelLabel";
import { summarizeNotificationBlock } from "@/features/players/notification-block";
import {
  PlayerForm,
  type PlayerFormValues,
} from "@/features/players/PlayerForm";
import { StrengthsWeaknesses } from "@/features/players/StrengthsWeaknesses";
import { WaitingListDialog } from "@/features/players/waiting-list-dialog";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function PlayerDetailScreen() {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const {
    data: players,
    isPending: playersPending,
    isError: playersError,
    refetch: refetchPlayers,
  } = useCoachPlayers();
  const { data: levels } = useCoachLevels();
  const { data: profile } = usePlayerProfile(playerId);
  const { data: standingList } = useStandingWaitingList();

  const editPlayer = useEditPlayer();
  const removePlayer = useRemovePlayer();
  const removeFromWaitingList = useRemoveFromStandingWaitingList();

  const [isEditing, setIsEditing] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  // players.remove rule 7 (PAD-274): the confirmation shows what the removal takes.
  const [removalImpact, setRemovalImpact] =
    React.useState<PlayerRemovalImpact | null>(null);
  const [removalImpactFailed, setRemovalImpactFailed] = React.useState(false);
  const [isEvalOpen, setIsEvalOpen] = React.useState(false);
  const [isWaitingListOpen, setIsWaitingListOpen] = React.useState(false);
  const [isClassesOpen, setIsClassesOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const player = React.useMemo(
    () =>
      (players ?? []).find((p) => String(p.playerId) === String(playerId)) ??
      null,
    [players, playerId]
  );

  // Mirrors web's PlayerDetailPage: the standing waiting list has no
  // per-player lookup endpoint, so fetch the full list and find this player.
  const standingEntry = React.useMemo(
    () =>
      (standingList ?? []).find(
        (e) => String(e.playerId) === String(player?.playerId)
      ) ?? null,
    [standingList, player]
  );

  // PAD-165: the student's own notification opt-outs (PAD-112), which web has
  // shown on player detail since it landed and iOS did not surface at all — a
  // coach inviting from the phone saw nothing happen and had no way to learn
  // why. The reason breakdown lives in the pure summarizer so it can be tested.
  const notificationBlock = React.useMemo(
    () => summarizeNotificationBlock(player),
    [player]
  );

  // PAD-165: web's PlayerHeader offers this link at any time; iOS only ever
  // showed one inline at creation (app/player/new.tsx), so a coach who
  // dismissed that screen could never re-share it from the phone.
  // auth.activate rule 3 (PAD-254): the roster row carries the link's secret
  // while the account is inactive; the link is only useful with it.
  const registerUrl = registerLink(
    WEB_APP_URL,
    player?.userId,
    player?.activationToken
  );

  const handleShareRegisterLink = async () => {
    try {
      // RN's own Share — not expo-sharing, which only shares local FILES, and
      // not expo-clipboard, which would add a native module this batch cannot
      // rebuild. The iOS share sheet already carries "Copy", and the link is
      // rendered selectable below for a long-press copy as well.
      //
      // `url` on iOS (UIActivityViewController treats it as a link, so targets
      // render a preview and Copy yields the bare URL); `message` on Android,
      // which ignores `url` entirely. Passing both would share two items.
      await Share.share(
        Platform.OS === "ios"
          ? { url: registerUrl }
          : { message: registerUrl }
      );
    } catch {
      toast.error(t("players.shareLinkFailed"));
    }
  };

  const handleRemoveFromWaitingList = async () => {
    if (!standingEntry || !player) return;
    try {
      await removeFromWaitingList.mutateAsync(standingEntry.id);
      toast.success(
        t("players.removedFromWaitingList", { name: player.name })
      );
    } catch {
      toast.error(t("players.removeFromWaitingListFailed"));
    }
  };

  const handleEditSave = async (values: PlayerFormValues) => {
    if (!player) return;
    setError(null);
    try {
      // Mirrors the web PlayerDetailPage: POST /app/edit_player with the
      // player row plus the updated fields (userId included, notes preserved).
      await editPlayer.mutateAsync({
        player,
        updates: {
          name: values.name || undefined,
          userId: player.userId,
          email: values.email || undefined,
          phone: values.phone || undefined,
          levelId: values.levelId,
          side: values.side,
          notes: values.notes,
        },
      });
      setIsEditing(false);
    } catch {
      setError(t("players.saveChangesFailedRetry"));
    }
  };

  // players.remove rules 4-5: the roster's `deletable` says whether this coach may
  // delete the record (a placeholder); otherwise they can only disconnect.
  const canDelete = player?.deletable === true;
  const removalAction =
    removalImpact?.action ?? (canDelete ? "delete" : "disconnect");

  const openRemove = () => {
    if (!player) return;
    setRemovalImpact(null);
    setRemovalImpactFailed(false);
    setIsDeleteOpen(true);
    playersApi
      .getPlayerRemovalImpact(String(player.playerId))
      .then(setRemovalImpact)
      .catch(() => setRemovalImpactFailed(true));
  };

  const handleRemove = async () => {
    if (!player || !user?.coachId) return;
    const name = player.name || t("players.defaultPlayerName");
    setError(null);
    try {
      await removePlayer.mutateAsync({
        coachId: user.coachId,
        playerId: String(player.playerId),
        action: removalAction,
      });
      setIsDeleteOpen(false);
      router.back();
    } catch (err) {
      setIsDeleteOpen(false);
      const code = playersApi.removePlayerErrorCode(err);
      setError(
        code === "PLAYER_HAS_ACCOUNT"
          ? t("players.removeRefusedHasAccount", { name })
          : code === "PLAYER_HAS_OTHER_COACHES"
            ? t("players.removeRefusedOtherCoaches", { name })
            : removalAction === "delete"
              ? t("players.removeFailedRetry")
              : t("players.disconnectFailed")
      );
    }
  };

  const header = (
    <View className="flex-row items-center gap-1 border-b border-border px-2 py-2">
      <Button
        variant="ghost"
        size="icon"
        testID="player-back"
        accessibilityLabel={t("players.backToPlayers")}
        onPress={() => router.back()}
      >
        <Ionicons name="chevron-back" size={24} color={lightTheme.foreground} />
      </Button>
      <Text
        role="heading"
        aria-level={1}
        className="flex-1 text-xl font-bold"
        numberOfLines={1}
      >
        {player?.name ?? t("players.defaultPlayerName")}
      </Text>
    </View>
  );

  if (playersPending) {
    return (
      <Screen edges={["top"]} testID="player-detail">
        {header}
        <View className="gap-4 p-4">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </View>
      </Screen>
    );
  }

  if (playersError) {
    return (
      <Screen edges={["top"]} testID="player-detail">
        {header}
        <ErrorState
          message={t("players.couldNotLoadPlayer")}
          onRetry={() => refetchPlayers()}
        />
      </Screen>
    );
  }

  if (!player) {
    return (
      <Screen edges={["top"]} testID="player-detail">
        {header}
        <EmptyState
          icon="person-outline"
          title={t("players.notFoundTitle")}
          message={t("players.notInRoster")}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={["top"]} testID="player-detail">
      {header}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="max-h-14 grow-0 border-b border-border"
        contentContainerClassName="flex-row items-center gap-2 px-4 py-2"
      >
        {/* PAD-162: the coach-side entry into the shared attendance-history
            screen, first in the action row exactly as web puts it first in
            PlayerDetailPage's PageActions. The student reaches the same screen
            from their dashboard "Attended" KPI; both land on one screen backed
            by one server-authorized endpoint. */}
        <Button
          variant="outline"
          size="sm"
          testID="player-attendance-link"
          accessibilityLabel={t("attendance.playerLink")}
          onPress={() =>
            router.push({
              pathname: "/attendance",
              params: { playerId: String(player.playerId) },
            })
          }
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={16}
            color={lightTheme.foreground}
          />
          <Text>{t("attendance.playerLink")}</Text>
        </Button>
        {/* PAD-163: the same entry point for "Faltas", kept immediately beside
            its attendance counterpart (web mirrors this in PlayerDetailPage's
            PageActions) so the pair reads as one idea. The student reaches the
            same screen from their dashboard "Missed" KPI. */}
        <Button
          variant="outline"
          size="sm"
          testID="player-absences-link"
          accessibilityLabel={t("absences.playerLink")}
          onPress={() =>
            router.push({
              pathname: "/absences",
              params: { playerId: String(player.playerId) },
            })
          }
        >
          <Ionicons
            name="close-circle-outline"
            size={16}
            color={lightTheme.foreground}
          />
          <Text>{t("absences.playerLink")}</Text>
        </Button>
        <Button
          variant="outline"
          size="sm"
          testID="player-add-to-classes"
          accessibilityLabel={t("players.addToClasses")}
          onPress={() => setIsClassesOpen(true)}
        >
          <Ionicons
            name="calendar-outline"
            size={16}
            color={lightTheme.foreground}
          />
          <Text>{t("players.addToClasses")}</Text>
        </Button>
        {standingEntry ? (
          <Button
            variant="outline"
            size="sm"
            testID="player-waiting-list-remove"
            accessibilityLabel={t("players.onWaitingList")}
            disabled={removeFromWaitingList.isPending}
            onPress={() => void handleRemoveFromWaitingList()}
            className="border-warning/40"
          >
            {removeFromWaitingList.isPending ? (
              <Spinner size="small" />
            ) : (
              <Ionicons
                name="close-circle-outline"
                size={16}
                color="#b45309"
              />
            )}
            <Text className="text-warning">
              {t("players.onWaitingList")}
            </Text>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            testID="player-waiting-list"
            accessibilityLabel={t("players.waitingList")}
            onPress={() => setIsWaitingListOpen(true)}
          >
            <Ionicons
              name="close-circle-outline"
              size={16}
              color={lightTheme.foreground}
            />
            <Text>{t("players.waitingList")}</Text>
          </Button>
        )}
        <Button
          size="sm"
          testID="player-add-evaluation"
          accessibilityLabel={t("players.addEvaluation")}
          onPress={() => setIsEvalOpen(true)}
        >
          <Ionicons
            name="clipboard-outline"
            size={16}
            color={lightTheme.primaryForeground}
          />
          <Text>{t("players.addEvaluation")}</Text>
        </Button>
      </ScrollView>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}
      >
        {isEditing ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("players.editPlayer")}</CardTitle>
            </CardHeader>
            <CardContent>
              <PlayerForm
                levels={levels ?? []}
                coachId={user?.coachId}
                initialValues={{
                  name: player.name ?? "",
                  email: player.email ?? "",
                  phone: player.phone ?? "",
                  levelId: player.levelId,
                  side: player.side,
                  notes: player.notes ?? "",
                }}
                saving={editPlayer.isPending}
                submitLabel={t("common.saveChanges")}
                onSubmit={handleEditSave}
                onCancel={() => setIsEditing(false)}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="gap-4 pt-6">
              <View className="flex-row items-center gap-3">
                <Avatar
                  alt={player.name || t("players.defaultPlayerName")}
                  className="h-14 w-14"
                >
                  <AvatarFallback>
                    <Text className="text-lg text-primary">
                      {getInitials(player.name || "")}
                    </Text>
                  </AvatarFallback>
                </Avatar>
                <View className="min-w-0 flex-1">
                  <Text className="text-lg font-semibold" numberOfLines={1}>
                    {player.name}
                  </Text>
                  {/* PAD-105: no @username line — the coach never sets it and
                      the record holds a generated placeholder until the player
                      activates their own account. */}
                </View>
              </View>

              <View className="gap-1">
                <Text className="text-sm text-muted-foreground">
                  Email: {player.email || "—"}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  Phone: {player.phone || "—"}
                </Text>
              </View>

              <View className="flex-row flex-wrap items-center gap-2">
                {player.level ? (
                  <Badge variant="outline">
                    <LevelLabel
                      code={player.level.code}
                      label={player.level.label}
                    />
                  </Badge>
                ) : (
                  <Badge variant="warning">
                    <Text>{t("players.noLevel")}</Text>
                  </Badge>
                )}
                {player.side ? (
                  <Badge variant="secondary">
                    <Text>{t(SIDE_LABEL_KEYS[player.side])}</Text>
                  </Badge>
                ) : null}
                {/* PAD-112 / PAD-165: the student switched their own class
                    invitations off. Shown so a coach reads a silent student as
                    a deliberate choice rather than as someone ignoring them. */}
                {notificationBlock.blocked ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-warning"
                    testID="player-notifications-blocked-badge"
                  >
                    <Ionicons
                      name="notifications-off-outline"
                      size={12}
                      color="#b45309"
                    />
                    <Text className="text-warning">
                      {t("players.notificationsBlockedBadge")}
                    </Text>
                  </Badge>
                ) : null}
              </View>

              {notificationBlock.blocked ? (
                <View
                  className="gap-1 rounded-lg border border-dashed border-warning bg-warning/5 p-3"
                  testID="player-notifications-blocked-detail"
                >
                  <View className="flex-row items-center gap-1">
                    <Ionicons
                      name="notifications-off-outline"
                      size={14}
                      color="#b45309"
                    />
                    <Text className="text-xs text-muted-foreground">
                      {t("players.notificationsBlockedTitle")}
                    </Text>
                  </View>
                  {notificationBlock.levelKeys.map((key) => (
                    <Text key={key} className="text-sm text-muted-foreground">
                      {`• ${t(key)}`}
                    </Text>
                  ))}
                  {/* Read-only for the coach — the reason belongs to the
                      student and is edited only from the student's Settings
                      (notifications.student-block-preferences rule 11). */}
                  <Text className="mt-1 text-xs text-muted-foreground">
                    {t("players.notificationsBlockedReason")}
                  </Text>
                  <Text
                    className="text-sm"
                    testID="player-notifications-blocked-reason"
                  >
                    {notificationBlock.reason ??
                      t("players.notificationsBlockedNoReason")}
                  </Text>
                </View>
              ) : null}

              {/* PAD-165: web's "no account yet" panel, available at any time
                  rather than only in the dialog that follows creation. */}
              {!player.isActive ? (
                <View
                  className="gap-3 rounded-lg border border-dashed border-warning bg-warning/5 p-3"
                  testID="player-no-account"
                >
                  <View className="flex-row gap-2">
                    <Ionicons
                      name="person-remove-outline"
                      size={16}
                      color="#b45309"
                    />
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm font-semibold">
                        {t("players.noAccountMessage")}
                      </Text>
                      <Text className="text-sm text-muted-foreground">
                        {t("players.shareRegisterLink")}
                      </Text>
                    </View>
                  </View>
                  {/* Selectable so the OS long-press "Copy" works without a
                      clipboard native module — same precedent as the invite
                      dialog in app/player/new.tsx. */}
                  <View
                    className="rounded-md border border-input bg-background px-3 py-2"
                    testID="player-register-link"
                  >
                    <Text selectable className="text-xs text-foreground">
                      {registerUrl}
                    </Text>
                  </View>
                  {/* players.claim rule 4: the student may already have their
                      own account — offer to link this record to it. */}
                  <ClaimLinkAction player={player} />
                  <Button
                    variant="outline"
                    size="sm"
                    testID="player-share-register-link"
                    accessibilityLabel={t("players.shareLinkAction")}
                    onPress={() => void handleShareRegisterLink()}
                  >
                    <Ionicons
                      name="share-outline"
                      size={16}
                      color={lightTheme.foreground}
                    />
                    <Text>{t("players.shareLinkAction")}</Text>
                  </Button>
                </View>
              ) : null}

              <View className="flex-row gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  testID="player-edit"
                  accessibilityLabel={t("players.editPlayer")}
                  onPress={() => setIsEditing(true)}
                >
                  <Text>{t("common.edit")}</Text>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  testID="player-remove"
                  accessibilityLabel={
                    canDelete
                      ? t("players.deletePlayer")
                      : t("players.disconnectPlayer")
                  }
                  onPress={openRemove}
                >
                  <Text>
                    {canDelete ? t("common.delete") : t("players.disconnect")}
                  </Text>
                </Button>
              </View>
            </CardContent>
          </Card>
        )}

        {error ? (
          <Text className="text-sm text-destructive">{error}</Text>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t("players.evaluations")}</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            {(profile?.evaluations ?? []).length === 0 ? (
              <Text className="text-sm text-muted-foreground">
                {t("players.noEvaluations")}
              </Text>
            ) : (
              (profile?.evaluations ?? []).map((ev) => (
                <View
                  key={ev.categoryId}
                  className="flex-row items-center justify-between gap-2"
                >
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm font-medium" numberOfLines={1}>
                      {ev.categoryName}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {format(parseISO(ev.evaluatedAt), "d MMM yyyy", { locale })}
                    </Text>
                  </View>
                  <Badge variant="outline">
                    <Text>
                      {ev.score}/{ev.scaleMax}
                    </Text>
                  </Badge>
                </View>
              ))
            )}
          </CardContent>
        </Card>

        <StrengthsWeaknesses
          playerId={String(player.playerId)}
          strengths={profile?.strengths ?? []}
          weaknesses={profile?.weaknesses ?? []}
        />
      </ScrollView>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("players.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {removalAction === "delete"
                ? t("players.deletePlaceholderConfirmDescription", {
                    name: player.name || t("players.deleteConfirmDefaultName"),
                  })
                : t("players.disconnectConfirmDescription", {
                    name: player.name || t("players.deleteConfirmDefaultName"),
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <View testID="player-removal-impact" className="gap-1">
            {removalImpact ? (
              <>
                <Text className="text-sm text-muted-foreground">
                  {t("players.removalImpactNotes", { count: removalImpact.notes })}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {t("players.removalImpactEvaluations", {
                    count: removalImpact.evaluations,
                  })}
                </Text>
                {removalImpact.presences !== undefined ? (
                  <Text className="text-sm text-muted-foreground">
                    {t("players.removalImpactPresences", {
                      count: removalImpact.presences,
                    })}
                  </Text>
                ) : null}
              </>
            ) : removalImpactFailed ? null : (
              <Text className="text-sm text-muted-foreground">
                {t("players.removalImpactLoading")}
              </Text>
            )}
          </View>
          <AlertDialogFooter>
            <AlertDialogCancel
              testID="player-remove-cancel"
              accessibilityLabel={t("players.cancelRemoveAria")}
              disabled={removePlayer.isPending}
            >
              <Text>{t("common.cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="player-remove-confirm"
              accessibilityLabel={
                removalAction === "delete"
                  ? t("players.confirmRemoveAria")
                  : t("players.confirmDisconnectAria")
              }
              className="bg-destructive"
              disabled={
                removePlayer.isPending ||
                (removalImpact === null && !removalImpactFailed)
              }
              onPress={handleRemove}
            >
              {removePlayer.isPending ? (
                <Spinner size="small" color="white" />
              ) : null}
              <Text className="text-destructive-foreground">
                {removalAction === "delete"
                  ? removePlayer.isPending
                    ? t("players.removing")
                    : t("common.delete")
                  : removePlayer.isPending
                    ? t("players.disconnecting")
                    : t("players.disconnect")}
              </Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddEvaluationForm
        open={isEvalOpen}
        onClose={() => setIsEvalOpen(false)}
        playerId={String(player.playerId)}
        currentEvaluations={profile?.evaluations ?? []}
      />

      <WaitingListDialog
        open={isWaitingListOpen}
        onClose={() => setIsWaitingListOpen(false)}
        playerId={Number(player.playerId)}
        playerName={player.name ?? null}
      />

      <AddToClassesDialog
        open={isClassesOpen}
        onClose={() => setIsClassesOpen(false)}
        playerId={String(player.playerId)}
        playerName={player.name ?? null}
      />
    </Screen>
  );
}
