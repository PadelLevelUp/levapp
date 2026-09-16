import { calendarApi, classesApi, notificationEngineApi } from "@levelup/api";
import {
  describeGate,
  describePriority,
  describeRules,
  describeSendStatus,
  describeVerdict,
  formatClubTime,
  resolveText,
  sortGates,
} from "@levelup/config";
import type {
  CalendarEvent,
  InviteExplain,
  InviteSimulation,
  InviteSimulationCandidate,
  InviteSimulationRequest,
  Player,
} from "@levelup/types";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { clubTodayISO } from "@levelup/config";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * PAD-196 — "Understand invites" on iOS (settings.tutorials rules 3–9).
 *
 * Same three steps and the same rendering order as web's
 * UnderstandInvitesTutorial, fed by the same `@levelup/api` calls and the same
 * `@levelup/config` formatter — the shells differ in presentation only.
 * Pickers are Pressable rows (an @rn-primitives Select's portal is invisible
 * to Maestro), each with a testID the flow can target.
 */

const WEEKS_AHEAD = 4;

function isoDate(date: Date): string {
  return clubTodayISO(date); // B-060: that instant's date on the club's clock
}

function isPickableClass(event: CalendarEvent): boolean {
  return (
    event.type === "class" &&
    event.status !== "canceled" &&
    (event.participantCount ?? 0) > 0
  );
}

function playerName(player: Player): string {
  return player.user?.name ?? `#${player.id}`;
}

export function UnderstandInvitesTutorial() {
  const { t } = useTranslation();
  const [selectedClass, setSelectedClass] = React.useState<CalendarEvent | null>(null);
  const [selectedPlayer, setSelectedPlayer] = React.useState<Player | null>(null);

  const from = React.useMemo(() => new Date(), []);
  const classesQuery = useQuery({
    queryKey: ["tutorial-classes", isoDate(from)],
    queryFn: () =>
      calendarApi.getCalendarEvents(
        isoDate(from),
        isoDate(new Date(from.getTime() + WEEKS_AHEAD * 7 * 86_400_000)),
      ),
    select: (events) =>
      events
        .filter(isPickableClass)
        .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)),
  });

  const playersQuery = useQuery({
    queryKey: [
      "tutorial-class-players",
      selectedClass?.model,
      selectedClass?.originalId,
      selectedClass?.date,
    ],
    queryFn: () => classesApi.getClassInstance(selectedClass!),
    enabled: selectedClass !== null,
    select: (instance) => instance.participants ?? [],
  });

  const request: InviteSimulationRequest | null =
    selectedClass && selectedPlayer
      ? {
          model: selectedClass.model,
          originalId: selectedClass.originalId,
          date: selectedClass.date,
          departingPlayerId: selectedPlayer.id,
        }
      : null;

  const simulationQuery = useQuery({
    queryKey: ["tutorial-simulation", request],
    queryFn: () => notificationEngineApi.simulateInvites(request!),
    enabled: request !== null,
    // "As of now": never serve a cached answer for a new visit (rule 8).
    staleTime: 0,
  });

  const pickClass = (event: CalendarEvent) => {
    setSelectedClass(event);
    setSelectedPlayer(null);
  };

  return (
    <View className="gap-3" testID="tutorial-understand-invites-screen">
      <Card>
        <CardHeader>
          <CardTitle>{t("tutorials.understandInvites.title")}</CardTitle>
          <CardDescription>{t("tutorials.understandInvites.intro")}</CardDescription>
        </CardHeader>
        <CardContent className="gap-5">
          {/* Step 1 — class */}
          <View className="gap-2">
            <Text className="text-sm font-semibold">
              {t("tutorials.understandInvites.stepClass")}
            </Text>
            {classesQuery.isPending && (
              <Text className="text-sm text-muted-foreground">
                {t("tutorials.understandInvites.loadingClasses")}
              </Text>
            )}
            {classesQuery.data && classesQuery.data.length === 0 && (
              <Text className="text-sm text-muted-foreground">
                {t("tutorials.understandInvites.noClasses")}
              </Text>
            )}
            {classesQuery.data?.map((event) => {
              const selected = selectedClass?.id === event.id;
              return (
                <Pressable
                  key={event.id}
                  testID={`tutorial-class-${event.id}`}
                  accessibilityLabel={event.title}
                  accessibilityState={{ selected }}
                  role="button"
                  onPress={() => pickClass(event)}
                  className={cn(
                    "rounded-lg border px-3 py-2 active:opacity-70",
                    selected ? "border-primary bg-primary/10" : "border-border",
                  )}
                >
                  <Text className="text-sm font-medium">{event.title}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {event.date} · {event.startTime}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Step 2 — player */}
          {selectedClass && (
            <View className="gap-2">
              <Text className="text-sm font-semibold">
                {t("tutorials.understandInvites.stepPlayer")}
              </Text>
              {playersQuery.isPending && (
                <Text className="text-sm text-muted-foreground">
                  {t("tutorials.understandInvites.loadingPlayers")}
                </Text>
              )}
              {playersQuery.data && playersQuery.data.length === 0 && (
                <Text className="text-sm text-muted-foreground">
                  {t("tutorials.understandInvites.noPlayers")}
                </Text>
              )}
              <View className="flex-row flex-wrap gap-2">
                {playersQuery.data?.map((player) => {
                  const selected = selectedPlayer?.id === player.id;
                  return (
                    <Pressable
                      key={player.id}
                      testID={`tutorial-player-${player.id}`}
                      accessibilityLabel={playerName(player)}
                      accessibilityState={{ selected }}
                      role="button"
                      onPress={() => setSelectedPlayer(player)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 active:opacity-70",
                        selected ? "border-primary bg-primary/10" : "border-border",
                      )}
                    >
                      <Text className="text-sm">{playerName(player)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Step 3 — results */}
          {request && (
            <View className="gap-3">
              <Text className="text-sm font-semibold">
                {t("tutorials.understandInvites.stepResults")}
              </Text>
              {simulationQuery.isPending && (
                <View className="flex-row items-center gap-2">
                  <Spinner size="small" />
                  <Text className="text-sm text-muted-foreground">
                    {t("tutorials.understandInvites.loadingResults")}
                  </Text>
                </View>
              )}
              {simulationQuery.isError && (
                <Text className="text-sm text-destructive">
                  {t("tutorials.understandInvites.error")}
                </Text>
              )}
              {simulationQuery.data && (
                <SimulationResults simulation={simulationQuery.data} request={request} />
              )}
            </View>
          )}
        </CardContent>
      </Card>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function SimulationResults({
  simulation,
  request,
}: {
  simulation: InviteSimulation;
  request: InviteSimulationRequest;
}) {
  const { t } = useTranslation();
  const gates = sortGates(simulation.gates);
  const blocked = gates.filter((g) => g.blocked);
  const spotParams = {
    side: t(`tutorials.sides.${simulation.spot.side ?? "none"}`),
    level: simulation.spot.levelCode ?? "",
    source: t(`tutorials.levelSource.${simulation.spot.levelSource}`),
  };

  return (
    <View className="gap-3" testID="tutorial-results">
      <Text className="text-xs text-muted-foreground" testID="tutorial-evaluated-at">
        {t("tutorials.understandInvites.evaluatedAt", {
          time: formatClubTime(simulation.evaluatedAt),
        })}
      </Text>

      {blocked.length > 0 ? (
        <View
          className="gap-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3"
          testID="tutorial-gates-blocked"
        >
          <Text className="text-sm font-semibold text-destructive">
            {t("tutorials.understandInvites.blockedTitle")}
          </Text>
          {blocked.map((gate) => (
            <Text key={gate.code} className="text-sm" testID={`tutorial-gate-${gate.code}`}>
              • {resolveText(t, describeGate(gate))}
            </Text>
          ))}
        </View>
      ) : (
        <Text className="text-sm text-muted-foreground" testID="tutorial-gates-clear">
          ✓ {t("tutorials.understandInvites.clearTitle")}
        </Text>
      )}

      {simulation.approvalRequired && (
        <View className="rounded-lg border border-border p-3" testID="tutorial-approval">
          <Text className="text-sm">{t("tutorials.understandInvites.approvalRequired")}</Text>
        </View>
      )}

      {simulation.waitingListPlacement && (
        <View className="rounded-lg border border-border p-3" testID="tutorial-waiting-list">
          <Text className="text-sm">
            {t("tutorials.understandInvites.waitingList", {
              name: simulation.waitingListPlacement.name ?? "",
            })}
            {simulation.waitingListPlacement.standing
              ? ` ${t("tutorials.understandInvites.waitingListStanding")}`
              : ""}
          </Text>
        </View>
      )}

      <Text className="text-sm" testID="tutorial-spot">
        {simulation.spot.levelCode
          ? t("tutorials.understandInvites.spot", spotParams)
          : t("tutorials.understandInvites.spotNoLevel", spotParams)}
      </Text>

      {simulation.rounds.map((round) => (
        <Card key={round.number} testID={`tutorial-round-${round.number}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {t("tutorials.understandInvites.roundTitle", { number: round.number })}
            </CardTitle>
            <CardDescription>
              {describeRules(round.rules)
                .map((text) => resolveText(t, text))
                .join(" · ")}
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-2 pt-0">
            {round.candidates.length === 0 ? (
              <Text className="text-sm text-muted-foreground">{t("tutorials.rounds.empty")}</Text>
            ) : (
              round.candidates.map((candidate) => (
                <CandidateRow key={candidate.playerId} candidate={candidate} />
              ))
            )}
          </CardContent>
        </Card>
      ))}

      <Separator />

      <Lookup request={request} />
    </View>
  );
}

function sendStatusVariant(status: InviteSimulationCandidate["sendStatus"]) {
  if (status === "first_batch") return "success" as const;
  if (status === "daily_quota") return "warning" as const;
  return "secondary" as const;
}

function CandidateRow({ candidate }: { candidate: InviteSimulationCandidate }) {
  const { t } = useTranslation();
  return (
    <View className="gap-1" testID={`tutorial-candidate-${candidate.playerId}`}>
      <View className="flex-row items-center gap-2">
        <Text className="w-7 text-sm text-muted-foreground">
          {t("tutorials.understandInvites.rank", { rank: candidate.rank })}
        </Text>
        <Text className="flex-1 text-sm font-medium" numberOfLines={1}>
          {candidate.name}
        </Text>
        {candidate.levelCode && (
          <Badge variant="outline">
            <Text>{candidate.levelCode}</Text>
          </Badge>
        )}
        <Badge
          variant={sendStatusVariant(candidate.sendStatus)}
          testID={`tutorial-send-status-${candidate.sendStatus}`}
        >
          <Text>{t(describeSendStatus(candidate.sendStatus).key)}</Text>
        </Badge>
      </View>
      <Text className="pl-9 text-xs text-muted-foreground">
        {[
          candidate.side ? t(`tutorials.sides.${candidate.side}`) : null,
          ...candidate.priority.map((p) => resolveText(t, describePriority(p))),
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// "Why isn't … invited?" (rule 5)
// ---------------------------------------------------------------------------

function Lookup({ request }: { request: InviteSimulationRequest }) {
  const { t } = useTranslation();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<{ id: string; name: string }[] | null>(null);
  const [verdict, setVerdict] = React.useState<InviteExplain | null>(null);
  // The name of the result the coach picked: refilling the input with it must
  // not re-run the search and reopen the list over the verdict.
  const [selectedName, setSelectedName] = React.useState<string | null>(null);
  const seq = React.useRef(0);

  React.useEffect(() => {
    const term = query.trim();
    if (!term || term === selectedName) {
      setResults(null);
      return;
    }
    const mine = ++seq.current;
    const handle = setTimeout(() => {
      notificationEngineApi
        .searchPlayers(term)
        .then((res) => {
          if (mine === seq.current) setResults(res.players);
        })
        .catch(() => {
          if (mine === seq.current) setResults([]);
        });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, selectedName]);

  React.useEffect(() => {
    setVerdict(null);
  }, [request.originalId, request.date, request.departingPlayerId]);

  const explain = (player: { id: string; name: string }) => {
    setResults(null);
    setSelectedName(player.name);
    setQuery(player.name);
    notificationEngineApi
      .explainInviteCandidate({ ...request, playerId: player.id })
      .then(setVerdict)
      .catch(() => setVerdict(null));
  };

  const text = verdict ? describeVerdict(verdict) : null;

  return (
    <View className="gap-2" testID="tutorial-lookup">
      <Text className="text-sm font-semibold">{t("tutorials.understandInvites.lookupTitle")}</Text>
      <Input
        testID="tutorial-lookup-input"
        placeholder={t("tutorials.understandInvites.lookupPlaceholder")}
        accessibilityLabel={t("tutorials.understandInvites.lookupTitle")}
        value={query}
        onChangeText={(value) => {
          setQuery(value);
          setSelectedName(null);
          setVerdict(null);
        }}
        autoCorrect={false}
      />
      {results && (
        <View className="rounded-md border border-border">
          {results.length === 0 ? (
            <Text className="px-3 py-2 text-sm text-muted-foreground">
              {t("tutorials.understandInvites.lookupNoResults")}
            </Text>
          ) : (
            results.map((player) => (
              <Pressable
                key={player.id}
                testID={`tutorial-lookup-result-${player.id}`}
                accessibilityLabel={player.name}
                role="button"
                onPress={() => explain(player)}
                className="px-3 py-2 active:bg-accent"
              >
                <Text className="text-sm">{player.name}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}

      {verdict && text && (
        <View className="rounded-lg border border-border p-3" testID="tutorial-verdict">
          <Text className="text-sm">
            <Text className="font-medium">
              {t("tutorials.understandInvites.notInvited", { name: verdict.name ?? "" })}
            </Text>{" "}
            <Text testID={`tutorial-verdict-stage-${verdict.stage}`}>
              {resolveText(t, text.headline)}
            </Text>
          </Text>
          {text.reasons.map((reason, index) => (
            <Text key={`${reason.key}-${index}`} className="pl-2 text-sm text-muted-foreground">
              • {resolveText(t, reason)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
