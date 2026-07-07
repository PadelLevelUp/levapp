import * as React from "react";
import { ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format, parseISO } from "date-fns";
import { lightTheme } from "@levelup/config";
import { useCoachLevels, usePlayerProfile } from "@levelup/hooks";
import { sideLabel } from "@levelup/types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
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
import {
  useCoachPlayers,
  useEditPlayer,
  useRemovePlayer,
} from "@/features/players/hooks";
import { LevelLabel } from "@/features/players/LevelLabel";
import {
  PlayerForm,
  type PlayerFormValues,
} from "@/features/players/PlayerForm";
import { StrengthsWeaknesses } from "@/features/players/StrengthsWeaknesses";

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

  const editPlayer = useEditPlayer();
  const removePlayer = useRemovePlayer();

  const [isEditing, setIsEditing] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const player = React.useMemo(
    () =>
      (players ?? []).find((p) => String(p.playerId) === String(playerId)) ??
      null,
    [players, playerId]
  );

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
          username: values.username || undefined,
          userId: player.userId,
          email: values.email || undefined,
          phone: values.phone || undefined,
          levelId: values.levelId,
          side: values.side,
          notes: player.notes,
        },
      });
      setIsEditing(false);
    } catch {
      setError("Failed to save changes. Please try again.");
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
      setError("Failed to remove player. Please try again.");
    }
  };

  const header = (
    <View className="flex-row items-center gap-1 border-b border-border px-2 py-2">
      <Button
        variant="ghost"
        size="icon"
        accessibilityLabel="Back to players"
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
        {player?.name ?? "Player"}
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
          message="Could not load this player."
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
          title="Player not found"
          message="This player is not in your roster."
        />
      </Screen>
    );
  }

  return (
    <Screen edges={["top"]} testID="player-detail">
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}
      >
        {isEditing ? (
          <Card>
            <CardHeader>
              <CardTitle>Edit player</CardTitle>
            </CardHeader>
            <CardContent>
              <PlayerForm
                levels={levels ?? []}
                coachId={user?.coachId}
                initialValues={{
                  name: player.name ?? "",
                  username: player.username ?? "",
                  email: player.email ?? "",
                  phone: player.phone ?? "",
                  levelId: player.levelId,
                  side: player.side,
                }}
                saving={editPlayer.isPending}
                submitLabel="Save changes"
                onSubmit={handleEditSave}
                onCancel={() => setIsEditing(false)}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="gap-4 pt-6">
              <View className="flex-row items-center gap-3">
                <Avatar alt={player.name || "Player"} className="h-14 w-14">
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
                  {player.username ? (
                    <Text
                      className="text-sm text-muted-foreground"
                      numberOfLines={1}
                    >
                      @{player.username}
                    </Text>
                  ) : null}
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
                    <Text>No level</Text>
                  </Badge>
                )}
                {player.side ? (
                  <Badge variant="secondary">
                    <Text>{sideLabel(player.side)}</Text>
                  </Badge>
                ) : null}
              </View>

              <View className="flex-row gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  testID="player-edit"
                  accessibilityLabel="Edit player"
                  onPress={() => setIsEditing(true)}
                >
                  <Text>Edit</Text>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  testID="player-remove"
                  accessibilityLabel="Remove player"
                  onPress={() => setIsDeleteOpen(true)}
                >
                  <Text>Remove</Text>
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
            <CardTitle>Evaluations</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            {(profile?.evaluations ?? []).length === 0 ? (
              <Text className="text-sm text-muted-foreground">
                No evaluations yet.
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
                      {format(parseISO(ev.evaluatedAt), "MMM d, yyyy")}
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
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {player.name || "this player"} from your
              roster. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              accessibilityLabel="Cancel removing player"
              disabled={removePlayer.isPending}
            >
              <Text>Cancel</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="player-remove-confirm"
              accessibilityLabel="Confirm remove player"
              className="bg-destructive"
              disabled={removePlayer.isPending}
              onPress={handleRemove}
            >
              {removePlayer.isPending ? (
                <Spinner size="small" color="white" />
              ) : null}
              <Text className="text-destructive-foreground">
                {removePlayer.isPending ? "Removing..." : "Remove"}
              </Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
