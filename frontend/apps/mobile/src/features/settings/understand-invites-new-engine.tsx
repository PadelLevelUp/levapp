import {
  describeGate,
  engineLeftOut,
  engineSideKey,
  engineSideSlug,
  engineTierGroups,
  engineTierLabel,
  engineVerdictLines,
  formatClubTime,
  resolveText,
  sortGates,
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

/**
 * NT4: a spot type's test-id suffix, its side and its level (`any` for a type of any level), so two
 * types of one side stay apart. The same string web uses.
 */
function typeSlug(type: Pick<EngineSpotType, "side" | "levelId">): string {
  return `${engineSideSlug(type.side)}-${type.levelId ?? "any"}`;
}

export function NewEngineResults({
  simulation,
  displayName,
}: {
  simulation: InviteSimulation;
  /** PAD-683: the coach's name for a student, the payload's name as the fallback. */
  displayName: (id: string | number, fallback: string) => string;
}) {
  const { t } = useTranslation();
  const spotTypes = simulation.spotTypes ?? [];
  // N4: the gates are the dry run's `may_plan` and why not, in today's gate shape.
  const blocked = sortGates(simulation.gates).filter((gate) => gate.blocked);
  // NT2: each student no type queues, once, with the first type's verdict (the shared helper web uses).
  const leftOut = engineLeftOut(spotTypes);

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

      {spotTypes.map((type, index) => (
        <SpotTypeBlock key={`${typeSlug(type)}-${index}`} type={type} displayName={displayName} />
      ))}

      <LeftOut verdicts={leftOut} displayName={displayName} />
    </View>
  );
}

function SpotTypeBlock({
  type,
  displayName,
}: {
  type: EngineSpotType;
  displayName: (id: string | number, fallback: string) => string;
}) {
  const { t } = useTranslation();
  const slug = typeSlug(type);
  const verdictOf = new Map<string, EngineVerdict>(type.verdicts.map((v) => [v.playerId, v]));
  return (
    <Card testID={`tutorial-type-${slug}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm" testID="tutorial-type-header">
          {[t(engineSideKey(type.side)), type.levelLabel].filter(Boolean).join(" · ")}
        </CardTitle>
        <Text className="text-xs text-muted-foreground" testID={`tutorial-type-${slug}-count`}>
          {t("tutorials.engine.openSpots", { count: type.count })}
        </Text>
      </CardHeader>
      <CardContent className="gap-3 pt-0">
        {engineTierGroups(type.queue).map((group, index) => (
          <View key={`${group.tier}-${index}`} className="gap-1" testID={`tutorial-tier-${slug}-${group.tier}`}>
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {resolveText(t, engineTierLabel(group.tier))}
            </Text>
            {group.entries.map((entry) => (
              <View key={entry.playerId} className="gap-0.5" testID={`tutorial-row-${entry.playerId}-${slug}`}>
                <View className="flex-row items-center gap-2">
                  <Text className="w-7 text-sm text-muted-foreground">
                    {t("tutorials.understandInvites.rank", { rank: entry.rank })}
                  </Text>
                  <Text className="flex-1 text-sm font-medium" numberOfLines={1}>
                    {/* PAD-683: the coach's own name for the student, the payload's as the fallback. */}
                    {displayName(entry.playerId, entry.nickname ?? entry.name)}
                  </Text>
                </View>
                {/* N6: the verdict's lines in this type, as web shows them; none when it has no verdict here. */}
                {verdictOf.has(entry.playerId) ? (
                  <Text className="pl-9 text-xs text-muted-foreground" testID={`tutorial-row-${entry.playerId}-${slug}-stage`}>
                    {engineVerdictLines(verdictOf.get(entry.playerId)!).map((line) => resolveText(t, line)).join(" · ")}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </CardContent>
    </Card>
  );
}

function LeftOut({
  verdicts,
  displayName,
}: {
  verdicts: EngineVerdict[];
  displayName: (id: string | number, fallback: string) => string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  if (verdicts.length === 0) return null;
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
        verdicts.map((verdict) => (
          <View key={verdict.playerId} className="gap-0.5" testID={`tutorial-left-out-${verdict.playerId}`}>
            {/* PAD-683: the coach's name first, then the payload's (N2 names the verdict, so a student
                off the roster still shows by name); the id only for an older payload without one. */}
            <Text className="text-sm font-medium">
              {displayName(verdict.playerId, verdict.nickname ?? verdict.name ?? `#${verdict.playerId}`)}
            </Text>
            {engineVerdictLines(verdict).map((line, index) => (
              <Text
                key={`${line.key}-${index}`}
                className="pl-2 text-xs text-muted-foreground"
                testID={`tutorial-left-out-${verdict.playerId}-line`}
              >
                • {resolveText(t, line)}
              </Text>
            ))}
          </View>
        ))}
    </View>
  );
}
