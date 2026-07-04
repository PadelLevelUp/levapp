import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { useClassInstance } from "@levelup/hooks";
import type { PresenceStatus } from "@levelup/types";
import { format, parseISO } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import {
  useCancelAttendance,
  useConfirmPresences,
  useRemoveClass,
  type AttendancePayloadItem,
} from "@/features/calendar/hooks";
import { paramsToEvent, type ClassRouteParams } from "@/features/calendar/params";
import {
  ParticipantRow,
  playerName,
  type AttendanceState,
} from "@/features/calendar/ParticipantRow";

function formatDay(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    return format(parseISO(dateStr), "EEE, MMM d");
  } catch {
    return dateStr;
  }
}

export default function ClassDetailScreen() {
  const params = useLocalSearchParams<ClassRouteParams>();
  const { user } = useAuth();
  const isCoach = user?.roles?.includes("coach") ?? false;

  const event = React.useMemo(() => paramsToEvent(params), [
    params.id,
    params.model,
    params.originalId,
    params.date,
  ]);

  const {
    data: instance,
    isPending,
    isError,
    refetch,
  } = useClassInstance(event);

  // Attendance draft, initialised from server presences whenever they load.
  const [attendance, setAttendance] = React.useState<
    Record<string, AttendanceState>
  >({});
  React.useEffect(() => {
    if (!instance?.participants) return;
    const initial: Record<string, AttendanceState> = {};
    for (const participant of instance.participants) {
      const existing = instance.presences?.find(
        (presence) => String(presence.playerId) === String(participant.id)
      );
      initial[String(participant.id)] = {
        status: (existing?.status ?? null) as PresenceStatus | null,
        justification: existing?.justification,
      };
    }
    setAttendance(initial);
  }, [instance?.id, instance?.participants, instance?.presences]);

  const confirmPresences = useConfirmPresences();
  const removeClass = useRemoveClass();
  const cancelAttendance = useCancelAttendance();

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  if (!event) {
    return (
      <Screen title="Class" testID="class-detail">
        <ErrorState message="This class could not be found." />
      </Screen>
    );
  }

  const title = instance?.name || event.title || "Class";
  const isCanceled = (instance?.status ?? event.status) === "canceled";
  const isRecurring = event.isRecurring || instance?.isRecurring === true;

  const participants = instance?.participants ?? [];
  const absentCount = (instance?.presences ?? []).filter(
    (presence) => presence.status === "absent"
  ).length;
  const filled = participants.length - (isCoach ? absentCount : 0);
  const maxPlayers = instance?.maxPlayers ?? event.maxPlayers ?? 0;

  const dateLabel =
    formatDay(instance?.date || event.date) || (params.displayDate ?? "");
  const startTime = instance?.startTime || event.startTime;
  const endTime = instance?.endTime || event.endTime;
  const timeLabel =
    startTime && endTime
      ? `${startTime} – ${endTime}`
      : (params.displayTime ?? "");

  const hasMarkedAttendance = Object.values(attendance).some(
    (state) => state.status !== null
  );

  const handleConfirmAttendance = async () => {
    if (!instance) return;
    const payload = participants
      .map((participant) => {
        const state = attendance[String(participant.id)];
        return {
          playerId: String(participant.id),
          status: state?.status,
          justification: state?.justification,
        };
      })
      .filter((item) => item.status != null) as AttendancePayloadItem[];
    if (payload.length === 0) return;

    setFeedback(null);
    try {
      await confirmPresences.mutateAsync({
        classInstance: instance,
        presences: payload,
      });
      setFeedback("Attendance saved");
    } catch {
      setFeedback("Failed to save attendance");
    }
  };

  const handleDelete = async (scope: "single" | "future") => {
    setDeleteOpen(false);
    try {
      await removeClass.mutateAsync({ event, scope });
      router.back();
    } catch {
      setFeedback("The class could not be deleted");
    }
  };

  // Student-only: their own presence row (the API only ever returns theirs).
  const myPresence = !isCoach ? (instance?.presences ?? [])[0] : undefined;
  const canCancelAttendance =
    !isCoach &&
    !isCanceled &&
    myPresence != null &&
    myPresence.status !== "absent";

  const handleCancelAttendance = async () => {
    setCancelOpen(false);
    if (!myPresence) return;
    setFeedback(null);
    try {
      await cancelAttendance.mutateAsync(Number(myPresence.lessonInstanceId));
      setFeedback("Your spot was released");
    } catch {
      setFeedback("Could not cancel attendance");
    }
  };

  return (
    <Screen edges={["top"]} testID="class-detail">
      {/* Header */}
      <View className="flex-row items-center gap-2 border-b border-border px-2 py-2">
        <Pressable
          testID="class-detail-back"
          accessibilityLabel="Back"
          role="button"
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
        >
          <Ionicons name="chevron-back" size={22} color={lightTheme.foreground} />
        </Pressable>
        <Text
          role="heading"
          aria-level={1}
          className="flex-1 text-lg font-bold"
          numberOfLines={1}
        >
          {title}
        </Text>
        {isCanceled ? (
          <Badge variant="destructive">
            <Text>Canceled</Text>
          </Badge>
        ) : null}
      </View>

      {isError ? (
        <ErrorState
          message="Could not load this class."
          onRetry={() => refetch()}
        />
      ) : isPending ? (
        <View className="gap-3 p-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4 pb-10">
          {/* Info cards */}
          <View className="flex-row gap-3">
            <View className="flex-1 rounded-lg border border-border bg-card p-3">
              <View className="flex-row items-center gap-1.5">
                <Ionicons
                  name="calendar-outline"
                  size={14}
                  color={lightTheme.mutedForeground}
                />
                <Text className="text-xs text-muted-foreground">Date</Text>
              </View>
              <Text className="mt-1 text-sm font-medium">
                {dateLabel || "—"}
              </Text>
            </View>
            <View className="flex-1 rounded-lg border border-border bg-card p-3">
              <View className="flex-row items-center gap-1.5">
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={lightTheme.mutedForeground}
                />
                <Text className="text-xs text-muted-foreground">Time</Text>
              </View>
              <Text className="mt-1 text-sm font-medium">
                {timeLabel || "—"}
              </Text>
            </View>
            <View className="flex-1 rounded-lg border border-border bg-card p-3">
              <View className="flex-row items-center gap-1.5">
                <Ionicons
                  name="people-outline"
                  size={14}
                  color={lightTheme.mutedForeground}
                />
                <Text className="text-xs text-muted-foreground">Capacity</Text>
              </View>
              <Text className="mt-1 text-sm font-medium">
                {maxPlayers ? `${filled}/${maxPlayers}` : "—"}
              </Text>
            </View>
          </View>

          {isRecurring ? (
            <View className="flex-row items-center gap-1.5">
              <Ionicons
                name="repeat-outline"
                size={14}
                color={lightTheme.mutedForeground}
              />
              <Text className="text-xs text-muted-foreground">
                Recurring class
                {instance?.recurrenceEnd
                  ? ` · until ${formatDay(instance.recurrenceEnd)}`
                  : ""}
              </Text>
            </View>
          ) : null}

          <Separator />

          {/* Participants + attendance */}
          <View className="gap-2">
            <Text className="text-sm font-semibold">
              Participants ({participants.length}/{maxPlayers || "—"})
            </Text>
            {participants.length === 0 ? (
              <Text className="text-sm text-muted-foreground">
                No participants
              </Text>
            ) : (
              participants.map((participant) => (
                <ParticipantRow
                  key={String(participant.id)}
                  player={participant}
                  presence={instance?.presences?.find(
                    (presence) =>
                      String(presence.playerId) === String(participant.id)
                  )}
                  attendance={
                    attendance[String(participant.id)] ?? { status: null }
                  }
                  onChange={(state) =>
                    setAttendance((prev) => ({
                      ...prev,
                      [String(participant.id)]: state,
                    }))
                  }
                  canMark={isCoach && !isCanceled}
                />
              ))
            )}

            {isCoach && participants.length > 0 && !isCanceled ? (
              <Button
                testID="attendance-confirm"
                accessibilityLabel="Confirm attendance"
                onPress={handleConfirmAttendance}
                disabled={!hasMarkedAttendance || confirmPresences.isPending}
                className="mt-1"
              >
                {confirmPresences.isPending ? (
                  <Spinner color={lightTheme.primaryForeground} />
                ) : null}
                <Text>Confirm attendance</Text>
              </Button>
            ) : null}
          </View>

          {/* Student: own status + cancel attendance */}
          {!isCoach && myPresence ? (
            <>
              <Separator />
              <View className="gap-2">
                <Text className="text-sm font-semibold">Your attendance</Text>
                <View className="flex-row items-center gap-2">
                  <Badge
                    variant={
                      myPresence.status === "absent"
                        ? "destructive"
                        : myPresence.confirmed
                          ? "success"
                          : "secondary"
                    }
                  >
                    <Text>
                      {myPresence.status === "present"
                        ? "Present"
                        : myPresence.status === "absent"
                          ? "Absent"
                          : myPresence.confirmed
                            ? "Confirmed"
                            : myPresence.invited
                              ? "Invited"
                              : "Registered"}
                    </Text>
                  </Badge>
                </View>
                {canCancelAttendance ? (
                  <Button
                    testID="class-cancel-attendance"
                    accessibilityLabel="Cancel attendance"
                    variant="outline"
                    onPress={() => setCancelOpen(true)}
                    disabled={cancelAttendance.isPending}
                  >
                    <Text className="text-destructive">Cancel attendance</Text>
                  </Button>
                ) : null}
              </View>
            </>
          ) : null}

          {feedback ? (
            <Text className="text-center text-sm text-muted-foreground">
              {feedback}
            </Text>
          ) : null}

          {/* Coach: delete */}
          {isCoach ? (
            <>
              <Separator />
              <Button
                testID="class-delete"
                accessibilityLabel="Delete class"
                variant="outline"
                onPress={() => setDeleteOpen(true)}
                disabled={removeClass.isPending}
              >
                {removeClass.isPending ? (
                  <Spinner color={lightTheme.destructive} />
                ) : (
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={lightTheme.destructive}
                  />
                )}
                <Text className="text-destructive">Delete class</Text>
              </Button>
            </>
          ) : null}
        </ScrollView>
      )}

      {/* Delete confirmation (scope choice for recurring classes) */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete class</AlertDialogTitle>
            <AlertDialogDescription>
              {isRecurring
                ? "This is a recurring class. Which classes would you like to delete?"
                : `This will delete "${title}". This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {isRecurring ? (
              <>
                <Button
                  testID="class-delete-confirm"
                  accessibilityLabel="Delete only this class"
                  variant="destructive"
                  onPress={() => handleDelete("single")}
                >
                  <Text>Only this class</Text>
                </Button>
                <Button
                  testID="class-delete-confirm-future"
                  accessibilityLabel="Delete this and future classes"
                  variant="destructive"
                  onPress={() => handleDelete("future")}
                >
                  <Text>This and future classes</Text>
                </Button>
              </>
            ) : (
              <Button
                testID="class-delete-confirm"
                accessibilityLabel="Confirm delete class"
                variant="destructive"
                onPress={() => handleDelete("single")}
              >
                <Text>Delete</Text>
              </Button>
            )}
            <AlertDialogCancel testID="class-delete-cancel">
              <Text>Cancel</Text>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Student cancel-attendance confirmation */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel attendance</AlertDialogTitle>
            <AlertDialogDescription>
              Your spot will be released and may be offered to another player.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              testID="class-cancel-attendance-confirm"
              accessibilityLabel="Confirm cancel attendance"
              variant="destructive"
              onPress={handleCancelAttendance}
            >
              <Text>Cancel my spot</Text>
            </Button>
            <AlertDialogCancel>
              <Text>Keep my spot</Text>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
