import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { effectiveMark, type PresenceMark } from "@levelup/config";
import type { PendingValidationClass } from "@levelup/types";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  availableRoster,
  clearValidated,
  filterRoster,
  makeWalkIn,
  partitionSelection,
  readyClassIds,
  remainingFor as remainingIn,
  resolvePresences,
  sortPlayers,
  toggleSelection,
  withExtras,
  type Edits,
  type Extras,
  type RosterOption,
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
  roster,
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
  /** The coach's players, for the walk-in picker. Empty simply hides it. */
  roster: RosterOption[];
  onValidate: (classes: ValidatePayload[]) => Promise<void>;
  onUnvalidate: (lessonInstanceId: number) => Promise<void>;
  busy?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { height } = useWindowDimensions();
  const [edits, setEdits] = React.useState<Edits>({});
  const [extras, setExtras] = React.useState<Extras>({});
  const [expandedId, setExpandedId] = React.useState<number | null>(null);
  const [detailId, setDetailId] = React.useState<number | null>(null);
  const [selected, setSelected] = React.useState<number[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);

  // Walk-ins are merged in once, here, so one behaves as an ordinary roster row
  // everywhere below — list, detail, readiness count and validate payload alike.
  const pendingClasses = React.useMemo(
    () => pending.map((klass) => withExtras(klass, extras)),
    [pending, extras]
  );
  const validatedClasses = React.useMemo(
    () => validated.map((klass) => withExtras(klass, extras)),
    [validated, extras]
  );

  const remainingFor = (klass: PendingValidationClass) =>
    remainingIn(klass, edits);

  function setMark(classId: number, playerId: number, mark: PresenceMark) {
    setEdits((prev) => ({
      ...prev,
      [classId]: { ...(prev[classId] ?? {}), [playerId]: mark },
    }));
  }

  /**
   * PAD-185 — add someone who attended but was never enrolled.
   *
   * Marked present on the spot: a coach only adds a person who was standing in
   * front of them, and leaving the row undecided would block the very class they
   * opened the picker to finish.
   *
   * Nothing is written yet. The row becomes a real `Presence` (and the instance
   * association `effective_filled_spots` counts) only when the class is
   * validated — `attendance.validation` rule 8.
   */
  function addWalkIn(klass: PendingValidationClass, option: RosterOption) {
    if (klass.players.some((p) => p.playerId === option.id)) return;
    setExtras((prev) => ({
      ...prev,
      [klass.lessonInstanceId]: [
        ...(prev[klass.lessonInstanceId] ?? []),
        makeWalkIn(option),
      ],
    }));
    setMark(klass.lessonInstanceId, option.id, "present");
  }

  const detail =
    detailId == null
      ? null
      : ([...pendingClasses, ...validatedClasses].find(
          (c) => c.lessonInstanceId === detailId
        ) ?? null);
  const detailIsValidated =
    detail != null &&
    validatedClasses.some(
      (c) => c.lessonInstanceId === detail.lessonInstanceId
    );

  async function validateClasses(classes: PendingValidationClass[]) {
    if (!classes.length) return;
    await onValidate(
      classes.map((klass) => ({
        lessonInstanceId: klass.lessonInstanceId,
        presences: resolvePresences(klass, edits[klass.lessonInstanceId] ?? {}),
      }))
    );
    setExpandedId(null);
    setSelected((prev) =>
      clearValidated(
        prev,
        classes.map((klass) => klass.lessonInstanceId)
      )
    );
  }

  /**
   * PAD-185 — validate the selection in one go.
   *
   * Rule 7: never force-approve. Classes with an unanswered player are written
   * back into the selection with a count of what was skipped, so the coach ends
   * up holding exactly the ones that still need them.
   */
  async function validateSelected() {
    const { ready: canValidate, needs } = partitionSelection(
      pendingClasses,
      selected,
      edits
    );
    if (canValidate.length) await validateClasses(canValidate);
    if (needs.length) {
      setNotice(t("presences.validate.skipped", { count: needs.length }));
      setSelected(needs.map((klass) => klass.lessonInstanceId));
    } else {
      setNotice(null);
    }
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

  const needsInput = pendingClasses.filter((c) => remainingFor(c) > 0);
  const ready = pendingClasses.filter((c) => remainingFor(c) === 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        // Reopening always lands on the list, never mid-edit, and never
        // holding a stale "N classes skipped" from the previous visit.
        if (!next) {
          setDetailId(null);
          setNotice(null);
        }
      }}
    >
      <DialogContent style={{ maxHeight: height * 0.85 }}>
        {detail ? (
          <ClassDetail
            klass={detail}
            isValidated={detailIsValidated}
            remaining={remainingFor(detail)}
            edits={edits[detail.lessonInstanceId] ?? {}}
            roster={availableRoster(roster, detail)}
            busy={busy}
            maxHeight={height * 0.5}
            onMark={(playerId, mark) =>
              setMark(detail.lessonInstanceId, playerId, mark)
            }
            onAddWalkIn={(option) => addWalkIn(detail, option)}
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

            {/* PAD-185 — the speed half. Validating a week one class at a time
                is a lot of taps on a phone; this is the same select/confirm
                pair web has, laid out as two full-width rows because three
                buttons across 390pt truncate their own labels. */}
            {pendingClasses.length > 0 && (
              <View className="mb-3 gap-2">
                <View className="flex-row gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={!ready.length}
                    onPress={() => {
                      setSelected(readyClassIds(pendingClasses, edits));
                      setNotice(null);
                    }}
                    testID="presences-select-ready"
                  >
                    <Text numberOfLines={1}>
                      {t("presences.validate.selectReady")}
                    </Text>
                  </Button>
                  {selected.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => {
                        setSelected([]);
                        setNotice(null);
                      }}
                      testID="presences-clear-selection"
                    >
                      <Text>{t("presences.validate.clear")}</Text>
                    </Button>
                  )}
                </View>
                {selected.length > 0 && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onPress={validateSelected}
                    testID="presences-validate-selected"
                  >
                    <Text numberOfLines={1}>
                      {t("presences.validate.validateSelected", {
                        count: selected.length,
                      })}
                    </Text>
                  </Button>
                )}
                {notice && (
                  <View className="flex-row items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
                    <Ionicons
                      name="warning-outline"
                      size={16}
                      color={lightTheme.foreground}
                    />
                    <Text
                      accessibilityRole="alert"
                      testID="presences-skipped-notice"
                      className="flex-1 text-sm text-warning-strong"
                    >
                      {notice}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <ScrollView
              style={{ maxHeight: height * 0.55 }}
              showsVerticalScrollIndicator
            >
              {loading ? (
                <View className="gap-2">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </View>
              ) : pendingClasses.length === 0 ? (
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
                            roster={availableRoster(roster, klass)}
                            expanded={expandedId === klass.lessonInstanceId}
                            selected={selected.includes(klass.lessonInstanceId)}
                            busy={busy}
                            onToggleExpand={() =>
                              setExpandedId((cur) =>
                                cur === klass.lessonInstanceId
                                  ? null
                                  : klass.lessonInstanceId
                              )
                            }
                            onToggleSelect={() =>
                              setSelected((prev) =>
                                toggleSelection(prev, klass.lessonInstanceId)
                              )
                            }
                            onMark={(playerId, mark) =>
                              setMark(klass.lessonInstanceId, playerId, mark)
                            }
                            onAddWalkIn={(option) => addWalkIn(klass, option)}
                            onOpen={() => setDetailId(klass.lessonInstanceId)}
                            onValidate={() => validateClasses([klass])}
                          />
                        ))}
                      </View>
                    ))}
                </View>
              )}

              {validatedClasses.length > 0 && (
                <View className="mt-4 gap-2">
                  <Text className="text-xs uppercase text-muted-foreground">
                    {t("presences.validate.validatedThisWeek")}
                  </Text>
                  {validatedClasses.map((klass) => (
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

/**
 * PAD-185 — the walk-in picker.
 *
 * A search field over an inline list, not a Select: a coach's roster runs to
 * dozens of names, and a popover of 40 items on a 390pt screen is a scroll
 * hunt. It also keeps the whole flow inside the sheet — @rn-primitives Select
 * portals out to the root host, where iOS accessibility cannot see it
 * (.maestro/README.md), which would put the one new action of this half beyond
 * the reach of the E2E suite.
 *
 * `label` distinguishes the two entry points web has: "Add player" from the
 * card, "Player joined last minute?" from the detail.
 */
function WalkInPicker({
  roster,
  label,
  testIDPrefix,
  onPick,
}: {
  roster: RosterOption[];
  label: string;
  testIDPrefix: string;
  onPick: (option: RosterOption) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  if (!roster.length) return null;

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 self-start"
        onPress={() => setOpen(true)}
        testID={`${testIDPrefix}-add-player`}
      >
        <Ionicons
          name="person-add-outline"
          size={14}
          color={lightTheme.foreground}
        />
        <Text>{label}</Text>
      </Button>
    );
  }

  const matches = filterRoster(roster, query);

  return (
    <View className="mt-2 gap-2 rounded-lg border border-border bg-muted/30 p-2">
      <Input
        autoFocus
        value={query}
        onChangeText={setQuery}
        placeholder={t("presences.validate.choosePlayer")}
        testID={`${testIDPrefix}-player-search`}
      />
      {/* Capped so the picker never swallows the sheet; the search field is
          how a coach reaches a name past the fold. */}
      <ScrollView
        style={{ maxHeight: 180 }}
        keyboardShouldPersistTaps="handled"
      >
        {matches.map((option) => (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityLabel={option.name}
            testID={`${testIDPrefix}-player-option-${option.id}`}
            onPress={() => {
              onPick(option);
              setQuery("");
              setOpen(false);
            }}
            className="border-b border-border/50 px-2 py-2.5"
          >
            <Text className="text-sm">{option.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onPress={() => {
          setQuery("");
          setOpen(false);
        }}
        testID={`${testIDPrefix}-add-player-cancel`}
      >
        <Text>{t("common.cancel")}</Text>
      </Button>
    </View>
  );
}

function ClassCard({
  klass,
  remaining,
  edits,
  roster,
  expanded,
  selected,
  busy,
  onToggleExpand,
  onToggleSelect,
  onMark,
  onAddWalkIn,
  onOpen,
  onValidate,
}: {
  klass: PendingValidationClass;
  remaining: number;
  edits: Record<number, PresenceMark>;
  roster: RosterOption[];
  expanded: boolean;
  selected: boolean;
  busy?: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onMark: (playerId: number, mark: PresenceMark) => void;
  onAddWalkIn: (option: RosterOption) => void;
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
      {/* The checkbox and the Validate button both sit OUTSIDE the expand
          Pressable — nesting a Pressable inside a Pressable breaks touch
          handling on iOS, and the selection checkbox is a Pressable. */}
      <View className="flex-row items-center gap-2">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          accessibilityLabel={t("presences.validate.selectClass", {
            name: klass.title,
          })}
          testID={`presences-select-${klass.lessonInstanceId}`}
        />
        <Pressable
          onPress={onToggleExpand}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          className="flex-1 flex-row items-center justify-between"
        >
          <View className="flex-1 pr-2">
            <Text className="text-sm font-sans-bold" numberOfLines={1}>
              {timeFmt.format(new Date(`${klass.startDatetime.slice(0, 19)}Z`))}{" "}
              · {klass.title}
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
      </View>

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

          <WalkInPicker
            roster={roster}
            label={t("presences.validate.addPlayer")}
            testIDPrefix="presences-card"
            onPick={onAddWalkIn}
          />

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
  roster,
  busy,
  maxHeight,
  onMark,
  onAddWalkIn,
  onBack,
  onValidate,
  onUnvalidate,
}: {
  klass: PendingValidationClass;
  isValidated: boolean;
  remaining: number;
  edits: Record<number, PresenceMark>;
  roster: RosterOption[];
  busy?: boolean;
  maxHeight: number;
  onMark: (playerId: number, mark: PresenceMark) => void;
  onAddWalkIn: (option: RosterOption) => void;
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

          <WalkInPicker
            roster={roster}
            label={t("presences.validate.lastMinute")}
            testIDPrefix="presences-detail"
            onPick={onAddWalkIn}
          />
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
