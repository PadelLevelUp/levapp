import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { effectiveMark, type PresenceMark } from "@levelup/config";
import type { PendingValidationClass } from "@levelup/types";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { PresenceMarkToggle } from "./PresenceMarkToggle";
import type { ValidatePayload } from "./hooks";
import {
  remainingFor as remainingIn,
  resolvePresences,
  sortPlayers,
  type Edits,
} from "./validate-state";

/**
 * PAD-140 — the coach's attendance inbox on iOS. PAD-185 gave it the depth.
 *
 * Same model as the web dialog: classes that have already run, browsed a week
 * at a time, split into "ready to confirm" (everyone answered) and "needs your
 * input". Marks live in local `edits` state layered over the stored value and
 * the response-based prefill (`@levelup/config`), and nothing persists until
 * Validate.
 *
 * Two levels, matching web:
 *   * the list, where a class expands inline for a quick pass; one class at a
 *     time, so a roster of six does not push the next class off-screen;
 *   * a full-screen detail (PAD-185), reached with "Open" or, on an
 *     already-validated class, "Edit" — it shows each player's own answer, a
 *     ready/awaiting banner, and can reopen a validated class.
 *
 * The arithmetic (what is ready, what a class resolves to) lives in
 * `validate-state.ts` so it is unit-testable; this file is presentation.
 */
export function ValidateClassesSheet({
  open,
  onOpenChange,
  pending,
  validated,
  weekOffset,
  onWeekChange,
  loading,
  onValidate,
  onUnvalidate,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: PendingValidationClass[];
  validated: PendingValidationClass[];
  weekOffset: number;
  onWeekChange: (next: number) => void;
  loading?: boolean;
  onValidate: (classes: ValidatePayload[]) => Promise<void>;
  onUnvalidate: (lessonInstanceId: number) => Promise<void>;
  busy?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { height } = useWindowDimensions();
  const [edits, setEdits] = React.useState<Edits>({});
  const [expandedId, setExpandedId] = React.useState<number | null>(null);
  const [detailId, setDetailId] = React.useState<number | null>(null);

  const remainingFor = (klass: PendingValidationClass) =>
    remainingIn(klass, edits);

  function setMark(classId: number, playerId: number, mark: PresenceMark) {
    setEdits((prev) => ({
      ...prev,
      [classId]: { ...(prev[classId] ?? {}), [playerId]: mark },
    }));
  }

  const detail =
    detailId == null
      ? null
      : [...pending, ...validated].find(
          (c) => c.lessonInstanceId === detailId
        ) ?? null;
  const detailIsValidated =
    detail != null &&
    validated.some((c) => c.lessonInstanceId === detail.lessonInstanceId);

  async function validateClasses(classes: PendingValidationClass[]) {
    if (!classes.length) return;
    await onValidate(
      classes.map((klass) => ({
        lessonInstanceId: klass.lessonInstanceId,
        presences: resolvePresences(klass, edits[klass.lessonInstanceId] ?? {}),
      }))
    );
    setExpandedId(null);
  }

  const weekLabel = React.useMemo(() => {
    // UTC throughout, matching `weekBounds` — the label must name the same week
    // the screen actually queried.
    const now = new Date();
    const dow = (now.getUTCDay() + 6) % 7;
    const monday = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - dow + weekOffset * 7
      )
    );
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const fmt = new Intl.DateTimeFormat(i18n.language, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    const name =
      weekOffset === 0
        ? t("presences.week.this")
        : weekOffset === -1
          ? t("presences.week.last")
          : weekOffset === 1
            ? t("presences.week.next")
            : t("presences.week.offset", {
                offset: weekOffset > 0 ? `+${weekOffset}` : weekOffset,
              });
    return `${name} · ${fmt.format(monday)} – ${fmt.format(sunday)}`;
  }, [weekOffset, i18n.language, t]);

  const needsInput = pending.filter((c) => remainingFor(c) > 0);
  const ready = pending.filter((c) => remainingFor(c) === 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        // Reopening always lands on the list, never mid-edit.
        if (!next) setDetailId(null);
      }}
    >
      <DialogContent style={{ maxHeight: height * 0.85 }}>
        {detail ? (
          <ClassDetail
            klass={detail}
            isValidated={detailIsValidated}
            remaining={remainingFor(detail)}
            edits={edits[detail.lessonInstanceId] ?? {}}
            busy={busy}
            maxHeight={height * 0.6}
            onMark={(playerId, mark) =>
              setMark(detail.lessonInstanceId, playerId, mark)
            }
            onBack={() => setDetailId(null)}
            onValidate={async () => {
              await validateClasses([detail]);
              setDetailId(null);
            }}
            onUnvalidate={async () => {
              await onUnvalidate(detail.lessonInstanceId);
              setDetailId(null);
            }}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("presences.validate.title")}</DialogTitle>
            </DialogHeader>

            <View className="mb-3 flex-row items-center justify-between rounded-lg border border-border bg-muted/40 px-2 py-1.5">
              <Pressable
                onPress={() => onWeekChange(weekOffset - 1)}
                testID="presences-week-prev"
                accessibilityRole="button"
                accessibilityLabel={t("presences.week.previous")}
                className="p-2"
              >
                <Ionicons
                  name="chevron-back"
                  size={18}
                  color={lightTheme.foreground}
                />
              </Pressable>
              <Text
                className="text-sm font-sans-bold"
                testID="presences-week-label"
              >
                {weekLabel}
              </Text>
              <Pressable
                onPress={() => onWeekChange(weekOffset + 1)}
                testID="presences-week-next"
                accessibilityRole="button"
                accessibilityLabel={t("presences.week.next")}
                className="p-2"
              >
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={lightTheme.foreground}
                />
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: height * 0.55 }}
              showsVerticalScrollIndicator
            >
              {loading ? (
                <View className="gap-2">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </View>
              ) : pending.length === 0 ? (
                <Text
                  testID="presences-validate-empty"
                  className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  {t("presences.validate.empty")}
                </Text>
              ) : (
                <View className="gap-4">
                  {[
                    { key: "needsInput" as const, items: needsInput },
                    { key: "ready" as const, items: ready },
                  ]
                    .filter((g) => g.items.length > 0)
                    .map((group) => (
                      <View key={group.key} className="gap-2">
                        <Text className="text-xs uppercase text-muted-foreground">
                          {t(`presences.validate.group.${group.key}`, {
                            count: group.items.length,
                          })}
                        </Text>
                        {group.items.map((klass) => (
                          <ClassCard
                            key={klass.lessonInstanceId}
                            klass={klass}
                            remaining={remainingFor(klass)}
                            edits={edits[klass.lessonInstanceId] ?? {}}
                            expanded={expandedId === klass.lessonInstanceId}
                            busy={busy}
                            onToggleExpand={() =>
                              setExpandedId((cur) =>
                                cur === klass.lessonInstanceId
                                  ? null
                                  : klass.lessonInstanceId
                              )
                            }
                            onMark={(playerId, mark) =>
                              setMark(klass.lessonInstanceId, playerId, mark)
                            }
                            onOpen={() => setDetailId(klass.lessonInstanceId)}
                            onValidate={() => validateClasses([klass])}
                          />
                        ))}
                      </View>
                    ))}
                </View>
              )}

              {validated.length > 0 && (
                <View className="mt-4 gap-2">
                  <Text className="text-xs uppercase text-muted-foreground">
                    {t("presences.validate.validatedThisWeek")}
                  </Text>
                  {validated.map((klass) => (
                    <View
                      key={klass.lessonInstanceId}
                      className="flex-row items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                    >
                      <View className="flex-1 flex-row items-center gap-2 pr-2">
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={lightTheme.success ?? lightTheme.primary}
                        />
                        <Text className="flex-1 text-sm" numberOfLines={1}>
                          {klass.title}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onPress={() => onUnvalidate(klass.lessonInstanceId)}
                          testID={`presences-undo-${klass.lessonInstanceId}`}
                        >
                          <Text>{t("presences.validate.undo")}</Text>
                        </Button>
                        {/* PAD-185: a validated class was a dead end on iOS —
                            undo was the only action, so correcting one meant
                            reopening it and starting over, or the web app. */}
                        <Button
                          variant="outline"
                          size="sm"
                          onPress={() => setDetailId(klass.lessonInstanceId)}
                          testID={`presences-edit-${klass.lessonInstanceId}`}
                        >
                          <Text>{t("presences.validate.edit")}</Text>
                        </Button>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ClassCard({
  klass,
  remaining,
  edits,
  expanded,
  busy,
  onToggleExpand,
  onMark,
  onOpen,
  onValidate,
}: {
  klass: PendingValidationClass;
  remaining: number;
  edits: Record<number, PresenceMark>;
  expanded: boolean;
  busy?: boolean;
  onToggleExpand: () => void;
  onMark: (playerId: number, mark: PresenceMark) => void;
  onOpen: () => void;
  onValidate: () => void;
}) {
  const { t, i18n } = useTranslation();
  const timeFmt = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  return (
    <View
      testID="presences-class-card"
      accessibilityLabel={klass.title}
      accessibilityValue={{ text: remaining === 0 ? "ready" : "needs-input" }}
      className="rounded-lg border border-border bg-card p-3"
    >
      {/* The header row toggles expansion. The Validate button sits OUTSIDE it —
          nesting a Pressable inside a Pressable breaks touch handling on iOS. */}
      <Pressable
        onPress={onToggleExpand}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="flex-row items-center justify-between"
      >
        <View className="flex-1 pr-2">
          <Text className="text-sm font-sans-bold" numberOfLines={1}>
            {timeFmt.format(new Date(`${klass.startDatetime.slice(0, 19)}Z`))} ·{" "}
            {klass.title}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {klass.type ? t(`presences.type.${klass.type}`) : null}
            {remaining > 0
              ? ` · ${t("presences.validate.awaiting", { count: remaining })}`
              : null}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={lightTheme.mutedForeground}
        />
      </Pressable>

      {expanded && (
        <View className="mt-3 gap-2">
          {sortPlayers(klass.players, edits).map((player) => (
            // Name ABOVE the toggles, not beside them. Side by side, three
            // buttons leave ~90pt for the name on a 390pt screen, which
            // truncated real names to "Bernar…" — unusable with two players
            // who share a first name.
            <View key={player.playerId} className="gap-1.5">
              <View className="flex-row items-center gap-1.5">
                <Text className="flex-1 text-sm" numberOfLines={1}>
                  {player.name}
                </Text>
                {player.guest && (
                  <Text className="text-[10px] text-muted-foreground">
                    {t("presences.guest")}
                  </Text>
                )}
              </View>
              <PresenceMarkToggle
                playerName={player.name}
                value={effectiveMark(player, edits[player.playerId])}
                onChange={(mark) => onMark(player.playerId, mark)}
              />
            </View>
          ))}

          <View className="mt-2 flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onPress={onOpen}
              testID="presences-open-class"
            >
              <Text>{t("presences.validate.open")}</Text>
            </Button>
            <Button
              className="flex-1"
              disabled={remaining > 0 || busy}
              onPress={onValidate}
              testID="presences-validate-class"
            >
              <Text>{t("presences.validate.validate")}</Text>
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * PAD-185 — one class, full sheet.
 *
 * What the inline card cannot show: each player's own answer (so the coach can
 * tell "said they were coming" from "never replied" before overruling it), a
 * banner naming what is still outstanding, and reopening an already-validated
 * class for correction without first undoing it.
 */
function ClassDetail({
  klass,
  isValidated,
  remaining,
  edits,
  busy,
  maxHeight,
  onMark,
  onBack,
  onValidate,
  onUnvalidate,
}: {
  klass: PendingValidationClass;
  isValidated: boolean;
  remaining: number;
  edits: Record<number, PresenceMark>;
  busy?: boolean;
  maxHeight: number;
  onMark: (playerId: number, mark: PresenceMark) => void;
  onBack: () => void;
  onValidate: () => void;
  onUnvalidate: () => void;
}) {
  const { t, i18n } = useTranslation();
  // `startDatetime` is naive UTC; parse and format it as UTC so the rendered
  // time is the class's actual clock time (same rule as the list).
  const timeFmt = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  return (
    <View testID="presences-class-detail">
      <DialogHeader>
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={onBack}
            testID="presences-detail-back"
            accessibilityRole="button"
            accessibilityLabel={t("presences.validate.back")}
            className="p-2"
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={lightTheme.foreground}
            />
          </Pressable>
          <DialogTitle className="flex-1" numberOfLines={1}>
            {timeFmt.format(new Date(`${klass.startDatetime.slice(0, 19)}Z`))} ·{" "}
            {klass.title}
          </DialogTitle>
        </View>
      </DialogHeader>

      <Text
        testID="presences-detail-banner"
        className={cn(
          "mb-3 rounded-lg px-3 py-2 text-sm",
          remaining > 0
            ? "bg-warning/10 text-warning-strong"
            : "bg-success/10 text-success-strong"
        )}
      >
        {remaining > 0
          ? t("presences.validate.awaiting", { count: remaining })
          : t("presences.validate.readyBanner")}
      </Text>

      <ScrollView style={{ maxHeight }} showsVerticalScrollIndicator>
        <View className="gap-2">
          {sortPlayers(klass.players, edits).map((player) => (
            <View
              key={player.playerId}
              className="gap-1.5 rounded-lg border border-border px-3 py-2"
            >
              <Text className="text-sm font-sans-bold" numberOfLines={1}>
                {player.name}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {/* The student's own answer, not the coach's decision — a
                    validated row reports "no answer" server-side rather than
                    attributing the coach's mark to the student
                    (attendance.validation rule 11). */}
                {t(`presences.response.${player.response}`)}
                {player.guest ? ` · ${t("presences.guest")}` : ""}
              </Text>
              <PresenceMarkToggle
                playerName={player.name}
                value={effectiveMark(player, edits[player.playerId])}
                onChange={(mark) => onMark(player.playerId, mark)}
              />
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="mt-3 gap-2">
        <Button
          disabled={remaining > 0 || busy}
          onPress={onValidate}
          testID="presences-detail-validate"
        >
          <Text>
            {isValidated
              ? t("presences.validate.saveChanges")
              : t("presences.validate.validateClass")}
          </Text>
        </Button>
        <View className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onPress={onBack}
            testID="presences-detail-back-button"
          >
            <Text>{t("presences.validate.back")}</Text>
          </Button>
          {isValidated && (
            <Button
              variant="ghost"
              className="flex-1"
              disabled={busy}
              onPress={onUnvalidate}
              testID="presences-detail-unvalidate"
            >
              <Text>{t("presences.validate.undoValidation")}</Text>
            </Button>
          )}
        </View>
      </View>
    </View>
  );
}
