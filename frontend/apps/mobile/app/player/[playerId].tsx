import * as React from "react";
import { ScrollView, View } from "react-native";
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
import { useDateLocale } from "@/lib/date-locale";
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
import {
  useCoachPlayers,
  useEditPlayer,
  useRemoveFromStandingWaitingList,
  useRemovePlayer,
  useStandingWaitingList,
} from "@/features/players/hooks";
import { LevelLabel } from "@/features/players/LevelLabel";
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

  const handleRemove = async () => {
    if (!player || !user?.coachId) return;
    setError(null);
    try {
      await removePlayer.mutateAsync({
        coachId: user.coachId,
        playerId: String(player.playerId),
      });
      setIsDeleteOpen(false);
      router.back();
    } catch {
      setIsDeleteOpen(false);
      setError(t("players.removeFailedRetry"));
    }
  };

  const header = (
    <View className="flex-row items-center gap-1 border-b border-border px-2 py-2">
      <Button
        variant="ghost"
        size="icon"
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
              </View>

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
                  accessibilityLabel={t("players.removePlayer")}
                  onPress={() => setIsDeleteOpen(true)}
                >
                  <Text>{t("common.remove")}</Text>
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
              {t("players.removeConfirmDescription", {
                name: player.name || t("players.deleteConfirmDefaultName"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              accessibilityLabel={t("players.cancelRemoveAria")}
              disabled={removePlayer.isPending}
            >
              <Text>{t("common.cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="player-remove-confirm"
              accessibilityLabel={t("players.confirmRemoveAria")}
              className="bg-destructive"
              disabled={removePlayer.isPending}
              onPress={handleRemove}
            >
              {removePlayer.isPending ? (
                <Spinner size="small" color="white" />
              ) : null}
              <Text className="text-destructive-foreground">
                {removePlayer.isPending ? t("players.removing") : t("common.remove")}
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
