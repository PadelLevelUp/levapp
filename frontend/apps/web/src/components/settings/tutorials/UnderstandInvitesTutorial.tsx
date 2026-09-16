import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { addDays, format } from "date-fns";
import { AlertTriangle, CheckCircle2, Loader2, Search } from "lucide-react";
import { describeGate, describePriority, describeRules, describeSendStatus, describeVerdict, formatClubTime, lisbonNow, resolveText, sortGates } from "@levelup/config";

import type {
  CalendarEvent,
  InviteExplain,
  InviteSimulation,
  InviteSimulationCandidate,
  InviteSimulationRequest,
  Player,
} from "@/types";
import { getCalendarEvents } from "@/api/calendar";
import { getClassInstance } from "@/api/classes";
import {
  explainInviteCandidate,
  searchPlayers,
  simulateInvites,
} from "@/api/notificationEngine";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * PAD-196 — "Understand invites" (settings.tutorials rules 3–9).
 *
 * Three steps on one screen: pick a class → pick who cancels → read what the
 * engine would do RIGHT NOW, then look up any single student who is missing.
 * Everything rendered here is a structured code from the backend turned into
 * a sentence by `@levelup/config`'s formatter, so iOS says the same thing.
 * The tutorial explains; it never acts (rule 9).
 */

const WEEKS_AHEAD = 4;

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

type Step = "class" | "player" | "results";

export function UnderstandInvitesTutorial() {
  const { t } = useTranslation();

  const [classes, setClasses] = useState<CalendarEvent[] | null>(null);
  const [selectedClass, setSelectedClass] = useState<CalendarEvent | null>(null);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [simulation, setSimulation] = useState<InviteSimulation | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A stale response must never overwrite a newer selection (rule 8).
  const requestSeq = useRef(0);

  useEffect(() => {
    let active = true;
    const today = lisbonNow(); // B-060: the club's date, as the iOS twin
    getCalendarEvents(
      format(today, "yyyy-MM-dd"),
      format(addDays(today, WEEKS_AHEAD * 7), "yyyy-MM-dd"),
    )
      .then((events) => {
        if (!active) return;
        const pickable = events
          .filter(isPickableClass)
          .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
        setClasses(pickable);
      })
      .catch(() => {
        if (active) setClasses([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const pickClass = (event: CalendarEvent) => {
    const seq = ++requestSeq.current;
    setSelectedClass(event);
    setSelectedPlayer(null);
    setSimulation(null);
    setError(null);
    setPlayers(null);
    getClassInstance(event)
      .then((instance) => {
        if (seq !== requestSeq.current) return;
        setPlayers(instance.participants ?? []);
      })
      .catch(() => {
        if (seq === requestSeq.current) setPlayers([]);
      });
  };

  const pickPlayer = (player: Player) => {
    if (!selectedClass) return;
    const seq = ++requestSeq.current;
    setSelectedPlayer(player);
    setSimulation(null);
    setError(null);
    setSimulating(true);
    const request: InviteSimulationRequest = {
      model: selectedClass.model,
      originalId: selectedClass.originalId,
      date: selectedClass.date,
      departingPlayerId: player.id,
    };
    simulateInvites(request)
      .then((result) => {
        if (seq !== requestSeq.current) return;
        setSimulation(result);
      })
      .catch(() => {
        if (seq === requestSeq.current) setError(t("tutorials.understandInvites.error"));
      })
      .finally(() => {
        if (seq === requestSeq.current) setSimulating(false);
      });
  };

  const step: Step = !selectedClass ? "class" : !selectedPlayer ? "player" : "results";

  const request: InviteSimulationRequest | null =
    selectedClass && selectedPlayer
      ? {
          model: selectedClass.model,
          originalId: selectedClass.originalId,
          date: selectedClass.date,
          departingPlayerId: selectedPlayer.id,
        }
      : null;

  return (
    <div className="space-y-4" data-testid="tutorial-understand-invites-screen">
      <Card>
        <CardHeader>
          <CardTitle>{t("tutorials.understandInvites.title")}</CardTitle>
          <CardDescription>{t("tutorials.understandInvites.intro")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1 — class */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{t("tutorials.understandInvites.stepClass")}</h3>
            {classes === null && (
              <p className="text-sm text-muted-foreground">
                {t("tutorials.understandInvites.loadingClasses")}
              </p>
            )}
            {classes !== null && classes.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("tutorials.understandInvites.noClasses")}
              </p>
            )}
            {classes && classes.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group">
                {classes.map((event) => {
                  const selected = selectedClass?.id === event.id;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      data-testid={`tutorial-class-${event.id}`}
                      aria-pressed={selected}
                      onClick={() => pickClass(event)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        selected
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      <span className="block font-medium">{event.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {event.date} · {event.startTime}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Step 2 — player */}
          {step !== "class" && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                {t("tutorials.understandInvites.stepPlayer")}
              </h3>
              {players === null && (
                <p className="text-sm text-muted-foreground">
                  {t("tutorials.understandInvites.loadingPlayers")}
                </p>
              )}
              {players !== null && players.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("tutorials.understandInvites.noPlayers")}
                </p>
              )}
              {players && players.length > 0 && (
                <div className="flex flex-wrap gap-2" role="group">
                  {players.map((player) => {
                    const selected = selectedPlayer?.id === player.id;
                    return (
                      <button
                        key={player.id}
                        type="button"
                        data-testid={`tutorial-player-${player.id}`}
                        aria-pressed={selected}
                        onClick={() => pickPlayer(player)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm transition-colors",
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        {playerName(player)}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Step 3 — results */}
          {step === "results" && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">
                {t("tutorials.understandInvites.stepResults")}
              </h3>
              {simulating && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("tutorials.understandInvites.loadingResults")}
                </p>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {simulation && request && (
                <SimulationResults simulation={simulation} request={request} />
              )}
            </section>
          )}
        </CardContent>
      </Card>
    </div>
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
  const sideKey = simulation.spot.side ?? "none";
  const spotParams = {
    side: t(`tutorials.sides.${sideKey}`),
    level: simulation.spot.levelCode ?? "",
    source: t(`tutorials.levelSource.${simulation.spot.levelSource}`),
  };

  return (
    <div className="space-y-4" data-testid="tutorial-results">
      <p className="text-xs text-muted-foreground" data-testid="tutorial-evaluated-at">
        {t("tutorials.understandInvites.evaluatedAt", {
          time: formatClubTime(simulation.evaluatedAt),
        })}
      </p>

      {/* Gates — blocked first (rule 4.1) */}
      {blocked.length > 0 ? (
        <Alert variant="destructive" data-testid="tutorial-gates-blocked">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("tutorials.understandInvites.blockedTitle")}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 space-y-0.5">
              {blocked.map((gate) => (
                <li key={gate.code} data-testid={`tutorial-gate-${gate.code}`}>
                  {resolveText(t, describeGate(gate))}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="tutorial-gates-clear">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          {t("tutorials.understandInvites.clearTitle")}
        </p>
      )}

      {simulation.approvalRequired && (
        <Alert data-testid="tutorial-approval">
          <AlertDescription>{t("tutorials.understandInvites.approvalRequired")}</AlertDescription>
        </Alert>
      )}

      {simulation.waitingListPlacement && (
        <Alert data-testid="tutorial-waiting-list">
          <AlertDescription>
            {t("tutorials.understandInvites.waitingList", {
              name: simulation.waitingListPlacement.name ?? "",
            })}{" "}
            {simulation.waitingListPlacement.standing &&
              t("tutorials.understandInvites.waitingListStanding")}
          </AlertDescription>
        </Alert>
      )}

      <p className="text-sm" data-testid="tutorial-spot">
        {simulation.spot.levelCode
          ? t("tutorials.understandInvites.spot", spotParams)
          : t("tutorials.understandInvites.spotNoLevel", spotParams)}
      </p>

      <div className="space-y-3">
        {simulation.rounds.map((round) => (
          <Card key={round.number} data-testid={`tutorial-round-${round.number}`}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">
                {t("tutorials.understandInvites.roundTitle", { number: round.number })}
              </CardTitle>
              <CardDescription>
                {describeRules(round.rules)
                  .map((text) => resolveText(t, text))
                  .join(" · ")}
              </CardDescription>
            </CardHeader>
            <CardContent className="py-2">
              {round.candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("tutorials.rounds.empty")}</p>
              ) : (
                <ol className="space-y-1.5">
                  {round.candidates.map((candidate) => (
                    <CandidateRow key={candidate.playerId} candidate={candidate} />
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      <Lookup request={request} />
    </div>
  );
}

function sendStatusVariant(status: InviteSimulationCandidate["sendStatus"]) {
  if (status === "first_batch") return "default" as const;
  if (status === "daily_quota") return "destructive" as const;
  return "secondary" as const;
}

function CandidateRow({ candidate }: { candidate: InviteSimulationCandidate }) {
  const { t } = useTranslation();
  return (
    <li
      className="flex flex-wrap items-center gap-2 text-sm"
      data-testid={`tutorial-candidate-${candidate.playerId}`}
    >
      <span className="w-7 text-muted-foreground tabular-nums">
        {t("tutorials.understandInvites.rank", { rank: candidate.rank })}
      </span>
      {/* Not `tutorial-candidate-*`: tests count rows by that prefix. */}
      <span className="font-medium" data-testid="tutorial-name">
        {candidate.name}
      </span>
      {candidate.levelCode && <Badge variant="outline">{candidate.levelCode}</Badge>}
      {candidate.side && (
        <span className="text-xs text-muted-foreground">
          {t(`tutorials.sides.${candidate.side}`)}
        </span>
      )}
      {candidate.priority.map((p) => (
        <span key={p.id} className="text-xs text-muted-foreground">
          {resolveText(t, describePriority(p))}
        </span>
      ))}
      <Badge
        variant={sendStatusVariant(candidate.sendStatus)}
        data-testid={`tutorial-send-status-${candidate.sendStatus}`}
        className="ml-auto"
      >
        {t(describeSendStatus(candidate.sendStatus).key)}
      </Badge>
    </li>
  );
}

// ---------------------------------------------------------------------------
// "Why isn't … invited?" (rule 5)
// ---------------------------------------------------------------------------

function Lookup({ request }: { request: InviteSimulationRequest }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [verdict, setVerdict] = useState<InviteExplain | null>(null);
  // The name of the result the coach picked: refilling the input with it must
  // not re-run the search and reopen the dropdown over the verdict.
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (!term || term === selectedName) {
      setResults(null);
      return;
    }
    const mine = ++seq.current;
    setSearching(true);
    const handle = setTimeout(() => {
      searchPlayers(term)
        .then((res) => {
          if (mine === seq.current) setResults(res.players);
        })
        .catch(() => {
          if (mine === seq.current) setResults([]);
        })
        .finally(() => {
          if (mine === seq.current) setSearching(false);
        });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, selectedName]);

  // A new class/player invalidates the previous verdict.
  useEffect(() => {
    setVerdict(null);
  }, [request.originalId, request.date, request.departingPlayerId]);

  const explain = (player: { id: string; name: string }) => {
    setResults(null);
    setSelectedName(player.name);
    setQuery(player.name);
    explainInviteCandidate({ ...request, playerId: player.id })
      .then(setVerdict)
      .catch(() => setVerdict(null));
  };

  const text = verdict ? describeVerdict(verdict) : null;

  return (
    <div className="space-y-2" data-testid="tutorial-lookup">
      <h4 className="text-sm font-semibold">{t("tutorials.understandInvites.lookupTitle")}</h4>
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="tutorial-lookup-input"
          className="pl-8"
          placeholder={t("tutorials.understandInvites.lookupPlaceholder")}
          aria-label={t("tutorials.understandInvites.lookupTitle")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedName(null);
            setVerdict(null);
          }}
        />
        {results && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                {searching
                  ? t("tutorials.understandInvites.lookupSearching")
                  : t("tutorials.understandInvites.lookupNoResults")}
              </li>
            ) : (
              results.map((player) => (
                <li key={player.id}>
                  <button
                    type="button"
                    data-testid={`tutorial-lookup-result-${player.id}`}
                    onClick={() => explain(player)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {player.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {verdict && text && (
        <div className="rounded-lg border border-border p-3 text-sm" data-testid="tutorial-verdict">
          <p>
            <span className="font-medium">
              {t("tutorials.understandInvites.notInvited", { name: verdict.name ?? "" })}
            </span>{" "}
            <span data-testid={`tutorial-verdict-stage-${verdict.stage}`}>
              {resolveText(t, text.headline)}
            </span>
          </p>
          {text.reasons.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {text.reasons.map((reason, index) => (
                <li key={`${reason.key}-${index}`}>{resolveText(t, reason)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
