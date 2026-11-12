import {
  describeGate,
  engineStageLine,
  engineVerdictLines,
  formatClubTime,
  inviteeTierText,
  resolveText,
  sortGates,
  type I18nText,
} from "@levelup/config";
import type { EngineSpotType, EngineVerdict, InviteSimulation } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

/**
 * PAD-920 (settings.tutorials NT1–NT4; notifications.invite-simulation N2, N4, N6) — the results of
 * "Understand invites" for a session on the new engine: one block per open spot type with its queue
 * grouped by tier, who is left out and why, and a banner when the run may not plan. The words are the
 * shared N6 helper's; an old-engine answer never reaches this component.
 */

/** N2: a new-engine answer carries `engine: "new"` and its per-type payload. */
export function isNewEngineSimulation(simulation: InviteSimulation): boolean {
  return simulation.engine === "new" || simulation.spotTypes !== undefined;
}

/** NT4: the side part of the test ids — null is "either". */
function sideId(side: EngineSpotType["side"]): "left" | "right" | "either" {
  return side ?? "either";
}

function sideHeaderKey(side: EngineSpotType["side"]): string {
  if (side === "left") return "players.sideLeft";
  if (side === "right") return "players.sideRight";
  return "tutorials.engine.sideEither";
}

/**
 * NT1: a tier's name. The tiers are the coach's list (0), the students' list (1), then one per
 * invitation group in the coach's order (notifications.config rule 20), so tier n ≥ 2 is group n − 1.
 */
function tierName(tier: number): I18nText {
  const text =
    tier === 0
      ? inviteeTierText({ tierSource: "coach_list" })
      : tier === 1
        ? inviteeTierText({ tierSource: "students_list" })
        : inviteeTierText({ tierSource: "pool", groupNumber: tier - 1 });
  return text ?? { key: "tutorials.engine.other" };
}

/** The queue split into runs of one tier, in the payload's order (N2 already sorts by tier). */
function groupByTier(queue: EngineSpotType["queue"]): Array<{ tier: number; entries: EngineSpotType["queue"] }> {
  const groups: Array<{ tier: number; entries: EngineSpotType["queue"] }> = [];
  for (const entry of queue) {
    const last = groups[groups.length - 1];
    if (last && last.tier === entry.tier) last.entries.push(entry);
    else groups.push({ tier: entry.tier, entries: [entry] });
  }
  return groups;
}

/**
 * NT2: every student the dry run names who is in no type's queue, in the order the verdicts first
 * name them. A student has one verdict per open type; their lines are the union across types, so a
 * student out of the pool reads each reason once.
 */
function leftOutStudents(spotTypes: EngineSpotType[]): Array<{ playerId: string; lines: I18nText[] }> {
  const queued = new Set(spotTypes.flatMap((type) => type.queue.map((entry) => entry.playerId)));
  const byPlayer = new Map<string, Map<string, I18nText>>();
  for (const type of spotTypes) {
    for (const verdict of type.verdicts) {
      if (queued.has(verdict.playerId)) continue;
      const lines = byPlayer.get(verdict.playerId) ?? new Map<string, I18nText>();
      for (const line of engineVerdictLines(verdict)) lines.set(JSON.stringify(line), line);
      byPlayer.set(verdict.playerId, lines);
    }
  }
  return [...byPlayer].map(([playerId, lines]) => ({ playerId, lines: [...lines.values()] }));
}

export function NewEngineResults({
  simulation,
  displayName,
}: {
  simulation: InviteSimulation;
  /** PAD-683: the coach's name for a student; a left-out verdict carries only the id (N2). */
  displayName: (id: string | number, fallback: string) => string;
}) {
  const { t } = useTranslation();
  const spotTypes = simulation.spotTypes ?? [];
  // N4: the gates are the dry run's `may_plan` and why not, in today's gate shape.
  const blocked = sortGates(simulation.gates).filter((gate) => gate.blocked);
  const leftOut = leftOutStudents(spotTypes);

  return (
    <View className="gap-3" testID="tutorial-results">
      <Text className="text-xs text-muted-foreground" testID="tutorial-evaluated-at">
        {t("tutorials.understandInvites.evaluatedAt", { time: formatClubTime(simulation.evaluatedAt) })}
      </Text>

      {blocked.length > 0 ? (
        // NT3: the run may not plan — a banner above the blocks says why.
        <View
          className="gap-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3"
          testID="tutorial-cannot-plan"
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

      {spotTypes.map((type) => (
        <SpotTypeBlock key={`${sideId(type.side)}-${type.levelId ?? "any"}`} type={type} />
      ))}

      <LeftOut students={leftOut} displayName={displayName} />
    </View>
  );
}

function SpotTypeBlock({ type }: { type: EngineSpotType }) {
  const { t } = useTranslation();
  const side = sideId(type.side);
  const verdictOf = new Map<string, EngineVerdict>(type.verdicts.map((v) => [v.playerId, v]));
  return (
    <Card testID={`tutorial-type-${side}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {[t(sideHeaderKey(type.side)), type.levelLabel].filter(Boolean).join(" · ")}
        </CardTitle>
        <Text className="text-xs text-muted-foreground" testID={`tutorial-type-${side}-count`}>
          {t("tutorials.engine.openSpots", { count: type.count })}
        </Text>
      </CardHeader>
      <CardContent className="gap-3 pt-0">
        {groupByTier(type.queue).map((group) => (
          <View key={group.tier} className="gap-1" testID={`tutorial-tier-${side}-${group.tier}`}>
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {resolveText(t, tierName(group.tier))}
            </Text>
            {group.entries.map((entry) => (
              <View key={entry.playerId} className="gap-0.5" testID={`tutorial-row-${entry.playerId}-${side}`}>
                <View className="flex-row items-center gap-2">
                  <Text className="w-7 text-sm text-muted-foreground">
                    {t("tutorials.understandInvites.rank", { rank: entry.rank })}
                  </Text>
                  <Text className="flex-1 text-sm font-medium" numberOfLines={1}>
                    {entry.nickname ?? entry.name}
                  </Text>
                </View>
                {/* N6: the stage's line; a queued student with no verdict in this type is waiting. */}
                <Text className="pl-9 text-xs text-muted-foreground" testID={`tutorial-row-${entry.playerId}-${side}-stage`}>
                  {resolveText(t, engineStageLine(verdictOf.get(entry.playerId)?.stage ?? "waiting"))}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </CardContent>
    </Card>
  );
}

function LeftOut({
  students,
  displayName,
}: {
  students: Array<{ playerId: string; lines: I18nText[] }>;
  displayName: (id: string | number, fallback: string) => string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  if (students.length === 0) return null;
  return (
    <View className="gap-2 rounded-lg border border-border p-3">
      {/* NT2: collapsed until the coach opens it. */}
      <Pressable
        testID="tutorial-left-out"
        role="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center justify-between active:opacity-70"
      >
        <Text className="text-sm font-semibold">{t("tutorials.engine.leftOutTitle")}</Text>
        <Text className="text-sm text-muted-foreground">{open ? "▴" : "▾"}</Text>
      </Pressable>
      {open &&
        students.map((student) => (
          <View key={student.playerId} className="gap-0.5" testID={`tutorial-left-out-${student.playerId}`}>
            <Text className="text-sm font-medium">{displayName(student.playerId, `#${student.playerId}`)}</Text>
            {student.lines.map((line, index) => (
              <Text
                key={`${line.key}-${index}`}
                className="pl-2 text-xs text-muted-foreground"
                testID={`tutorial-left-out-${student.playerId}-line`}
              >
                • {resolveText(t, line)}
              </Text>
            ))}
          </View>
        ))}
    </View>
  );
}
