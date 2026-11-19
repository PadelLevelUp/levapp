import * as React from "react";
import type { PlayerRemovalImpact } from "@levelup/types";
import { playersApi } from "@levelup/api";
import { ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { lightTheme, nicknameShown, standingEndLabel, type InfoEditSession } from "@levelup/config";
import { useCoachLevels, useEvaluationCompetencies, usePlayerEvaluations, usePlayerProfile } from "@levelup/hooks";
import { SIDE_LABEL_KEYS } from "@levelup/types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { WEB_APP_URL } from "@/lib/config";
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
import { EvaluationsBlock } from "@/features/evaluations/evaluations-block";
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
import { PlayerInfoBlock } from "@/features/players/player-info-block";
import { PlayerStateAlerts } from "@/features/players/player-state-alerts";
import { PENDING_TONE } from "@/features/players/players-list-alerts";
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
  const { t, i18n } = useTranslation();
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
  // evaluations.history rule 2: the card's date is the server's `lastEvaluatedOn`.
  const evaluationHistory = usePlayerEvaluations(playerId);
  const competencySet = useEvaluationCompetencies();
  // players.profile rule 10 (PAD-834): the history screen, optionally opened on the form
  // ("new") or on a record (the last evaluation's Editar).
  const openEvaluations = (form?: string) =>
    router.push({
      pathname: "/player-evaluations/[playerId]",
      params: {
        playerId: String(playerId),
        name: player?.displayName ?? player?.name ?? "",
        ...(form ? { form } : {}),
      },
    });
  const { data: standingList } = useStandingWaitingList();

  const editPlayer = useEditPlayer();
  const removePlayer = useRemovePlayer();
  const removeFromWaitingList = useRemoveFromStandingWaitingList();

  const [isEditing, setIsEditing] = React.useState(false);
  // players.profile rule 8 (PAD-834): Block 1 edits on its own; null in read mode.
  const [infoSession, setInfoSession] = React.useState<InfoEditSession | null>(null);
  const scrollRef = React.useRef<ScrollView>(null);
  const infoBlockY = React.useRef(0);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  // players.remove rule 7 (PAD-274): the confirmation shows what the removal takes.
  const [removalImpact, setRemovalImpact] =
    React.useState<PlayerRemovalImpact | null>(null);
  const [removalImpactFailed, setRemovalImpactFailed] = React.useState(false);
  const [isWaitingListOpen, setIsWaitingListOpen] = React.useState(false);
  const [isWaitingListRenewOpen, setIsWaitingListRenewOpen] = React.useState(false);
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
  // PAD-507: "Renovar · Até 3 de out. de 2027" — the button's text and its accessibility label.
  const renewLabel = standingEntry
    ? `${t("players.renewWaitingList")} · ${t("players.waitingListUntil", {
        date: standingEntry.expiresOn ? standingEndLabel(standingEntry.expiresOn, i18n.language) : "",
      })}`
    : "";

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

  const handleRemoveFromWaitingList = async () => {
    if (!standingEntry || !player) return;
    try {
      await removeFromWaitingList.mutateAsync(standingEntry.id);
      toast.success(
        t("players.removedFromWaitingList", { name: player.displayName ?? player.name })
      );
    } catch {
      toast.error(t("players.removeFromWaitingListFailed"));
    }
  };

  const handleEditSave = async (values: PlayerFormValues) => {
    if (!player) return;
    setError(null);
    try {
      // players.profile rule 4 (PAD-834): the header's edit holds the name and the nickname only;
      // the rest is Block 1's (handleInfoSave).
      await editPlayer.mutateAsync({
        player,
        updates: {
          name: values.name || undefined,
          userId: player.userId,
          // PAD-660: sent only when changed; blank clears (the server trims).
          ...(values.nickname !== undefined && values.nickname !== (player.nickname ?? "")
            ? { nickname: values.nickname }
            : {}),
          ...(values.nicknameAsName !== undefined && values.nicknameAsName !== (player.nicknameAsName ?? false)
            ? { nicknameAsName: values.nicknameAsName }
            : {}),
        },
      });
      setIsEditing(false);
    } catch (err) {
      // PAD-388: a 400 names the fields the server refused (today only an empty name).
      setError(
        playersApi.editPlayerInvalidFields(err) ? t("players.invalidFields") : t("players.saveChangesFailedRetry"),
      );
    }
  };

  // players.profile rule 8 (PAD-834): Block 1's Guardar — only the keys that changed.
  const handleInfoSave = async (changes: Record<string, string | null>) => {
    if (!player) return;
    setError(null);
    try {
      await editPlayer.mutateAsync({ player, updates: { userId: player.userId, ...changes } });
      setInfoSession(null);
    } catch (err) {
      setError(
        playersApi.editPlayerInvalidFields(err) ? t("players.invalidFields") : t("players.saveChangesFailedRetry"),
      );
    }
  };

  // players.profile rule 9: "Completar informação" opens Block 1 and brings it into view (a picker
  // sheet takes no focus on iOS).
  const completeInfo = () => {
    setInfoSession("complete");
    scrollRef.current?.scrollTo({ y: Math.max(0, infoBlockY.current - 8), animated: true });
  };

  // players.remove rules 4-5: the roster's `deletable` says whether this coach may
  // delete the record (a placeholder); otherwise they can only disconnect.
  const canDelete = player?.deletable === true;
  // players.remove rules 7, 9 (PAD-834, assumption Q5): a pending player's removal is "Cancelar
  // convite". The label follows `pendingRegistration`; the mode follows the removal impact.
  const cancelsInvite = player?.pendingRegistration === true;
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
    const name = (player.displayName ?? player.name) || t("players.defaultPlayerName");
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
        {player?.displayName ?? player?.name ?? t("players.defaultPlayerName")}
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
      {/* PAD-410: the action row wraps (flexWrap) rather than scrolling
          horizontally, so every action is visible without hiding any of
          them off-screen, per the master-detail mock. Order mirrors the
          mock exactly: presences, absences, add-to-classes, waiting list,
          Avaliações (primary), Desassociar (destructive, last). */}
      <View className="flex-row flex-wrap items-center gap-2 border-b border-border px-4 py-2">
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
        ) : null}
        {/* PAD-507: an entry runs to a date; the coach sees it and can renew (same id on web). */}
        {standingEntry ? (
          <Button
            variant="outline"
            size="sm"
            testID="player-waiting-list-renew"
            accessibilityLabel={renewLabel}
            onPress={() => setIsWaitingListRenewOpen(true)}
          >
            <Ionicons name="refresh-outline" size={16} color={lightTheme.foreground} />
            <Text>{renewLabel}</Text>
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
        {/* evaluations.history rule 3: "Avaliações" is a primary action; it pushes a screen. */}
        <Button
          size="sm"
          testID="player-evaluations-action"
          accessibilityLabel={t("players.evaluationHistory.open")}
          onPress={() => openEvaluations()}
        >
          <Ionicons
            name="clipboard-outline"
            size={16}
            color={lightTheme.primaryForeground}
          />
          <Text>{t("players.evaluationHistory.open")}</Text>
        </Button>
        {/* PAD-410: Desassociar/delete moved into the action row (last, destructive)
            from its old spot paired with Editar in the profile card — Editar is now
            in the header, beside the avatar. Same testID, handler and copy as before. */}
        <Button
          variant="destructive"
          size="sm"
          testID="player-remove"
          accessibilityLabel={
            cancelsInvite
              ? t("players.card.cancelInvite")
              : canDelete
                ? t("players.deletePlayer")
                : t("players.disconnectPlayer")
          }
          onPress={openRemove}
        >
          <Ionicons
            name="person-remove-outline"
            size={16}
            color={lightTheme.destructiveForeground}
          />
          {/* PAD-320: the mode in the id, so a flow proves "delete" vs
              "disconnect" without reading the rendered word. */}
          <Text
            testID={`player-remove-mode-${canDelete ? "delete" : "disconnect"}`}
            className="text-destructive-foreground"
          >
            {cancelsInvite ? t("players.card.cancelInvite") : canDelete ? t("common.delete") : t("players.disconnect")}
          </Text>
        </Button>
      </View>
      <ScrollView
        ref={scrollRef}
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
                showNickname
                identityOnly
                initialValues={{
                  name: player.name ?? "",
                  email: player.email ?? "",
                  phone: player.phone ?? "",
                  levelId: player.levelId,
                  side: player.side,
                  notes: player.notes ?? "",
                  nickname: player.nickname ?? "",
                  nicknameAsName: player.nicknameAsName ?? false,
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
              {/* PAD-410: header block — large avatar, name, level/side chips,
                  and Editar at the top right (same testID, handler and copy
                  as the old bottom-row button; only its position changed). */}
              <View className="flex-row items-start justify-between gap-3">
                <View className="min-w-0 flex-1 flex-row items-center gap-3">
                  <Avatar
                    alt={(player.displayName ?? player.name) || t("players.defaultPlayerName")}
                    className={player.pendingRegistration === true ? "h-14 w-14 border-2 border-dashed border-violet-400" : "h-14 w-14"}
                    testID={player.pendingRegistration === true ? "player-avatar-pending" : undefined}
                  >
                    <AvatarFallback>
                      <Text className="text-lg text-primary">
                        {getInitials((player.displayName ?? player.name) || "")}
                      </Text>
                    </AvatarFallback>
                  </Avatar>
                  <View className="min-w-0 flex-1">
                    <Text className="text-lg font-semibold" numberOfLines={1}>
                      {player.displayName ?? player.name}
                    </Text>
                    {nicknameShown(player) ? (
                      <Text
                        className="text-sm text-muted-foreground"
                        numberOfLines={1}
                        testID="player-real-name"
                      >
                        {player.name}
                      </Text>
                    ) : null}
                    {/* PAD-105: no @username line — the coach never sets it and
                        the record holds a generated placeholder until the player
                        activates their own account. */}

                    {/* PAD-410: level and side chips under the name, as in the mock. */}
                    <View className="mt-1 flex-row flex-wrap items-center gap-2">
                      {player.level ? (
                        <Badge variant="outline" testID="player-level-badge">
                          <LevelLabel
                            code={player.level.code}
                            label={player.level.label}
                          />
                        </Badge>
                      ) : (
                        // players.profile rule 9 (PAD-834): the amber "Sem nível" chip.
                        <Badge variant="warning" testID="player-chip-no-level">
                          <Text>{t("players.card.noLevel")}</Text>
                        </Badge>
                      )}
                      {player.side ? (
                        <Badge variant="secondary" testID="player-side-badge">
                          <Text>{t(SIDE_LABEL_KEYS[player.side])}</Text>
                        </Badge>
                      ) : (
                        <Badge variant="warning" testID="player-chip-no-side">
                          <Text>{t("players.card.noSide")}</Text>
                        </Badge>
                      )}
                      {/* players.profile rule 11 (PAD-834): the pending chip, not amber. */}
                      {player.pendingRegistration === true ? (
                        <Badge variant="outline" className="border-violet-300" testID="player-chip-pending">
                          <Text style={{ color: PENDING_TONE }}>{t("players.card.pendingChip")}</Text>
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
                  </View>
                </View>
                <Button
                  variant="outline"
                  size="sm"
                  testID="player-edit"
                  accessibilityLabel={t("players.editPlayer")}
                  disabled={infoSession !== null}
                  onPress={() => setIsEditing(true)}
                >
                  <Text>{t("common.edit")}</Text>
                </Button>
              </View>

            </CardContent>
          </Card>
        )}

        {error ? (
          <Text className="text-sm text-destructive">{error}</Text>
        ) : null}

        {/* players.profile rules 9, 11 (PAD-834): the state alerts, above the blocks. */}
        <PlayerStateAlerts
          player={player}
          inviteLink={registerUrl}
          onComplete={completeInfo}
          completeDisabled={isEditing || infoSession !== null}
          claimAction={<ClaimLinkAction player={player} />}
        />

        {/* players.profile rule 8 (PAD-834): Block 1, Informação — its own edit. */}
        <View onLayout={(e) => { infoBlockY.current = e.nativeEvent.layout.y; }}>
          <PlayerInfoBlock
            player={player}
            levels={levels ?? []}
            session={infoSession}
            onEdit={() => setInfoSession("edit")}
            onCancel={() => setInfoSession(null)}
            onSave={handleInfoSave}
            editDisabled={isEditing}
          >
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
          </PlayerInfoBlock>
        </View>

        {/* players.profile rule 10 (PAD-834): Block 2, Avaliações. */}
        <EvaluationsBlock
          playerId={String(player.playerId)}
          authorName={user?.name ?? ""}
          records={evaluationHistory.data?.records ?? []}
          lastEvaluatedOn={evaluationHistory.data?.lastEvaluatedOn}
          competencies={competencySet.data?.competencies ?? []}
          competenciesWithData={evaluationHistory.data?.competenciesWithData ?? []}
          loading={evaluationHistory.isLoading}
          ready={Boolean(evaluationHistory.data && competencySet.data)}
          onOpenHistory={() => openEvaluations()}
          onNew={() => openEvaluations("new")}
          onEdit={(record) => openEvaluations(String(record.id))}
        />

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
              {cancelsInvite
                ? t(removalAction === "delete" ? "players.card.cancelInviteConfirm" : "players.card.cancelInviteConfirmShared", {
                    name: (player.displayName ?? player.name) || t("players.deleteConfirmDefaultName"),
                  })
                : removalAction === "delete"
                ? t("players.deletePlaceholderConfirmDescription", {
                    name: (player.displayName ?? player.name) || t("players.deleteConfirmDefaultName"),
                  })
                : t("players.disconnectConfirmDescription", {
                    name: (player.displayName ?? player.name) || t("players.deleteConfirmDefaultName"),
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
                {cancelsInvite
                  ? t("players.card.cancelInvite")
                  : removalAction === "delete"
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

      <WaitingListDialog
        open={isWaitingListOpen}
        onClose={() => setIsWaitingListOpen(false)}
        playerId={Number(player.playerId)}
        playerName={player.displayName ?? player.name ?? null}
        profileSide={player.side ?? null}
      />
      {standingEntry ? (
        <WaitingListDialog
          open={isWaitingListRenewOpen}
          onClose={() => setIsWaitingListRenewOpen(false)}
          playerId={Number(player.playerId)}
          playerName={player.displayName ?? player.name ?? null}
          renewing={standingEntry}
        />
      ) : null}

      <AddToClassesDialog
        open={isClassesOpen}
        onClose={() => setIsClassesOpen(false)}
        playerId={String(player.playerId)}
        playerName={player.displayName ?? player.name ?? null}
      />
    </Screen>
  );
}
