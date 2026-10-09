/**
 * PAD-547 (calendar.event-detail rules 19–20, notifications.waiting-list rules 18–22) — iOS port of
 * web's ClassWaitingListSection: the class's waiting list with each row's origin and (PAD-560,
 * rule 19) how long the student is on it, a remove control, an edit control that moves a row
 * between the scopes (rule 22), and "Add to waiting list" for this class only, the whole series
 * or a period (rules 18, 19, 19a). Coach only. In-app controls with test ids throughout (PAD-320:
 * Maestro asserts by id).
 */
import { Ionicons } from "@expo/vector-icons";
import {
  STANDING_PRESETS,
  WAITING_LIST_MAX_PERIOD_CLASSES,
  WAITING_LIST_SCOPE_KEYS,
  clubTodayISO,
  describeIneligible,
  formatShortDate,
  lightTheme,
  resolveText,
  standingEndFor,
  standingPresetOf,
  waitingListCandidates,
  waitingListDraftFor,
  waitingListOriginKey,
  waitingListPeriodValid,
  waitingListPickerOptions,
  waitingListRowIsManagedInSettings,
  waitingListScopeLabel,
  waitingListScopeOptions,
  waitingListScopeRequest,
  wholeSeriesEndPreview,
  type WaitingListDialogScope,
  type WaitingListPeriodMode,
} from "@levelup/config";
import * as notificationEngineApi from "@levelup/api/src/resources/notificationEngine";
import type { CoachClassWaitingListRow, EligibilityCheckEntry } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { useCoachPlayers } from "@/features/players/hooks";
import { nativeLocaleTag } from "@/lib/native-locale";

/** B-295: the date picker's own dialog renders inside this dialog's overlay, above it. */
const DIALOG_PORTAL_HOST = "class-waiting-list-dialog-host";

interface Props {
  event: { model: string; originalId: string | number; date?: string | null };
  isRecurring: boolean;
  /** The series' end date (`YYYY-MM-DD`), for the whole-series "on the list until" line (rule 19). */
  recurrenceEnd?: string | null;
  rows: CoachClassWaitingListRow[];
  enrolledIds: Array<string | number>;
  onChanged: () => void;
}

export function ClassWaitingListSection({ event, isRecurring, recurrenceEnd, rows, enrolledIds, onChanged }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = React.useState(rows.length > 0);
  const [dialog, setDialog] = React.useState<null | { editing: CoachClassWaitingListRow | null }>(null);

  const remove = async (row: CoachClassWaitingListRow) => {
    try {
      await notificationEngineApi.removeFromClassWaitingList(row.id);
      onChanged();
    } catch {
      toast.error(t("common.somethingWentWrong"));
    }
  };

  return (
    <View className="gap-2" testID="class-waiting-list">
      <Pressable
        testID="class-waiting-list-toggle"
        role="button"
        onPress={() => setOpen((o) => !o)}
        className="flex-row items-center justify-between py-1"
      >
        <Text className="text-sm font-semibold">{t("calendar.detail.waitingList", { count: rows.length })}</Text>
        <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={16} color={lightTheme.mutedForeground} />
      </Pressable>
      {open ? (
        <View className="gap-1.5">
          {rows.length === 0 ? (
            <Text className="text-xs text-muted-foreground">{t("calendar.detail.waitingListEmpty")}</Text>
          ) : (
            rows.map((row) => {
              const scope = waitingListScopeLabel(row, (iso) => formatShortDate(iso, nativeLocaleTag(i18n.language)));
              const managed = waitingListRowIsManagedInSettings(row);
              return (
              <View
                key={row.id}
                testID={`class-waiting-list-row-${row.playerId}-${row.origin}`}
                className="flex-row items-center justify-between py-1"
              >
                <View className="flex-1">
                  <Text className="text-sm" numberOfLines={1}>{row.playerName}</Text>
                  <Text
                    testID={`class-waiting-list-row-scope-${row.playerId}-${row.scope}`}
                    className="text-[11px] text-muted-foreground"
                  >
                    {t(waitingListOriginKey(row))} · {t(scope.key, scope.params)}
                  </Text>
                  {managed ? (
                    <Text testID={`class-waiting-list-managed-${row.playerId}`} className="text-[11px] italic text-muted-foreground">
                      {t("calendar.detail.waitingListManagedInSettings")}
                    </Text>
                  ) : null}
                </View>
                {/* Rule 22: a coach-wide standing row is changed in Settings, not here. */}
                {!managed ? (
                  <Pressable
                    testID={`class-waiting-list-edit-${row.playerId}`}
                    accessibilityLabel={t("calendar.detail.waitingListEditRow")}
                    role="button"
                    hitSlop={8}
                    onPress={() => setDialog({ editing: row })}
                    className="h-7 w-7 items-center justify-center"
                  >
                    <Ionicons name="pencil" size={16} color={lightTheme.mutedForeground} />
                  </Pressable>
                ) : null}
                <Pressable
                  testID={`class-waiting-list-remove-${row.playerId}`}
                  accessibilityLabel={t("calendar.detail.waitingListRemove")}
                  role="button"
                  hitSlop={8}
                  onPress={() => void remove(row)}
                  className="h-7 w-7 items-center justify-center"
                >
                  <Ionicons name="close" size={18} color={lightTheme.mutedForeground} />
                </Pressable>
              </View>
              );
            })
          )}
          <Button size="sm" variant="outline" testID="class-waiting-list-add" onPress={() => setDialog({ editing: null })}>
            <Text>{t("calendar.detail.waitingListAdd")}</Text>
          </Button>
        </View>
      ) : null}
      <ScopeDialog
        open={dialog !== null}
        editing={dialog?.editing ?? null}
        onClose={() => setDialog(null)}
        event={event}
        isRecurring={isRecurring}
        recurrenceEnd={recurrenceEnd ?? null}
        rows={rows}
        enrolledIds={enrolledIds}
        onSaved={() => {
          setDialog(null);
          setOpen(true);
          onChanged();
        }}
      />
    </View>
  );
}

function ScopeDialog({
  open,
  editing,
  onClose,
  event,
  isRecurring,
  recurrenceEnd,
  rows,
  enrolledIds,
  onSaved,
}: {
  open: boolean;
  /** Rule 22: the row being moved between scopes; null when adding. */
  editing: CoachClassWaitingListRow | null;
  onClose: () => void;
  event: Props["event"];
  isRecurring: boolean;
  recurrenceEnd: string | null;
  rows: CoachClassWaitingListRow[];
  enrolledIds: Array<string | number>;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { data: roster } = useCoachPlayers({ enabled: open && !editing });
  const candidates = React.useMemo(
    () => waitingListCandidates(roster ?? [], enrolledIds, rows),
    [roster, enrolledIds, rows]
  );
  const [playerId, setPlayerId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  // PAD-558 (rule 20): the search narrows what is offered; the chosen student stays listed.
  const offered = React.useMemo(
    () => waitingListPickerOptions(candidates, search, playerId),
    [candidates, search, playerId]
  );
  const [scope, setScope] = React.useState<WaitingListDialogScope>("occurrence");
  const [periodMode, setPeriodMode] = React.useState<WaitingListPeriodMode>("classes");
  const [today, setToday] = React.useState(() => new Date());
  const [{ classes, expiresOn }, setPeriod] = React.useState(() => {
    const { classes: c, expiresOn: e } = waitingListDraftFor(null, new Date());
    return { classes: c, expiresOn: e };
  });
  const setClasses = (update: (c: number) => number) => setPeriod((p) => ({ ...p, classes: update(p.classes) }));
  const setExpiresOn = (next: string) => setPeriod((p) => ({ ...p, expiresOn: next }));
  const [ineligible, setIneligible] = React.useState<EligibilityCheckEntry[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const now = new Date();
    setToday(now);
    setSearch("");
    setIneligible([]);
    // Rule 22: an edit opens on the row's scope and end (the shared draft); an add on this class only.
    const draft = waitingListDraftFor(editing, now);
    setScope(draft.scope);
    setPeriodMode(draft.periodMode);
    setPeriod({ classes: draft.classes, expiresOn: draft.expiresOn });
    setPlayerId(editing ? String(editing.playerId) : null);
  }, [open, editing]);

  // Rule 20: mark who would fail the class's bar today, as the class editor's picker does.
  React.useEffect(() => {
    if (!open || editing || candidates.length === 0) return;
    notificationEngineApi
      .checkEligibility(event.model, String(event.originalId), event.date, candidates.map((c) => c.playerId))
      .then(({ ineligible: failing }) => setIneligible(failing))
      .catch(() => setIneligible([]));
  }, [open, candidates.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const reasonsById = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of describeIneligible(ineligible)) map.set(String(s.playerId), s.reasons.map((r) => resolveText(t, r)));
    return map;
  }, [ineligible, t]);
  const preset = standingPresetOf(expiresOn, today);
  const periodValid = waitingListPeriodValid(scope, periodMode, classes, expiresOn, today);
  const scopes = waitingListScopeOptions(isRecurring);
  const seriesUntil = formatShortDate(wholeSeriesEndPreview(recurrenceEnd, clubTodayISO(today)), nativeLocaleTag(i18n.language));

  const confirm = async () => {
    if (!playerId || !periodValid) return;
    setSaving(true);
    const req = waitingListScopeRequest(scope, periodMode, classes, expiresOn);
    try {
      if (editing) {
        await notificationEngineApi.changeClassWaitingListScope(editing.id, req);
      } else {
        const result = await notificationEngineApi.addToClassWaitingList({
          model: event.model,
          originalId: event.originalId,
          date: event.date,
          playerId: Number(playerId),
          ...req,
        });
        if (result.action === "already_on_list") toast.warning(t("calendar.detail.waitingListAlready"));
      }
      onSaved();
    } catch {
      toast.error(t(editing ? "calendar.detail.waitingListChangeFailed" : "calendar.detail.waitingListAddFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent testID="class-waiting-list-dialog" innerPortalHost={DIALOG_PORTAL_HOST}>
        <DialogHeader>
          <DialogTitle>{t(editing ? "calendar.detail.waitingListEdit" : "calendar.detail.waitingListAdd")}</DialogTitle>
        </DialogHeader>
        {editing ? (
          <Text testID="class-waiting-list-editing-name" className="text-sm font-medium">{editing.playerName}</Text>
        ) : (
          <>
            <Input
              testID="class-waiting-list-search"
              placeholder={t("calendar.detail.waitingListSearch")}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              <View className="gap-1">
                {offered.map((c) => {
                  const reasons = reasonsById.get(String(c.playerId));
                  const chosen = playerId === String(c.playerId);
                  return (
                    <Pressable
                      key={c.playerId}
                      testID={`class-waiting-list-candidate-${c.playerId}`}
                      role="button"
                      onPress={() => setPlayerId(String(c.playerId))}
                      className={`rounded-md border px-3 py-2 ${chosen ? "border-primary bg-primary/10" : "border-border"}`}
                    >
                      <Text className="text-sm">{c.name}</Text>
                      {reasons ? (
                        <View testID={`class-waiting-list-ineligible-${c.playerId}`}>
                          <Text className="text-[11px] text-warning">{t("calendar.detail.waitingListIneligibleHint")}</Text>
                          {reasons.map((r, i) => (
                            <Text key={i} className="text-[11px] text-muted-foreground">• {r}</Text>
                          ))}
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </>
        )}
        <View className="gap-2">
          <Text className="text-sm font-medium">{t("calendar.detail.waitingListScope")}</Text>
          <View className="flex-row flex-wrap gap-2">
            {scopes.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={scope === s ? "default" : "outline"}
                testID={`class-waiting-list-scope-${s}`}
                onPress={() => setScope(s)}
              >
                <Text>{t(WAITING_LIST_SCOPE_KEYS[s])}</Text>
              </Button>
            ))}
          </View>
          {scope === "series" ? (
            // Rule 19: the whole series asks nothing more; it says the date the entry will run to.
            <Text testID="class-waiting-list-series-until" className="text-xs text-muted-foreground">
              {t("calendar.detail.waitingListSeriesRunsTo", { date: seriesUntil })}
            </Text>
          ) : null}
          {scope === "period" ? (
            // Rule 19a: exactly one of a number of classes or an end date.
            <View className="gap-2">
              <View className="flex-row flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={periodMode === "classes" ? "default" : "outline"}
                  testID="class-waiting-list-period-classes"
                  onPress={() => setPeriodMode("classes")}
                >
                  <Text>{t("calendar.detail.waitingListPeriodClasses")}</Text>
                </Button>
                <Button
                  size="sm"
                  variant={periodMode === "date" ? "default" : "outline"}
                  testID="class-waiting-list-period-date"
                  onPress={() => setPeriodMode("date")}
                >
                  <Text>{t("calendar.detail.waitingListPeriodUntil")}</Text>
                </Button>
              </View>
              {periodMode === "classes" ? (
                <View className="flex-row items-center gap-3">
                  <Text className="text-sm font-medium">{t("calendar.detail.waitingListClasses")}</Text>
                  <Button size="sm" variant="outline" testID="class-waiting-list-classes-minus" onPress={() => setClasses((c) => Math.max(1, c - 1))}>
                    <Text>−</Text>
                  </Button>
                  <Text testID="class-waiting-list-classes" className="w-6 text-center text-sm font-medium">{classes}</Text>
                  <Button size="sm" variant="outline" testID="class-waiting-list-classes-plus" onPress={() => setClasses((c) => Math.min(WAITING_LIST_MAX_PERIOD_CLASSES, c + 1))}>
                    <Text>+</Text>
                  </Button>
                </View>
              ) : (
                <View className="gap-2">
                  <Text className="text-sm font-medium">{t("players.endDate")}</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {STANDING_PRESETS.map((opt) => (
                      <Pressable
                        key={opt.key}
                        testID={`class-waiting-list-preset-${opt.key}`}
                        role="button"
                        onPress={() => setExpiresOn(standingEndFor(opt.key, today))}
                        className={`rounded-md border px-3 py-1.5 ${preset === opt.key ? "border-primary bg-primary" : "border-border"}`}
                      >
                        <Text className={`text-sm ${preset === opt.key ? "text-primary-foreground" : ""}`}>{t(opt.labelKey)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {/* Any date today through 12 months ahead, as the standing-list dialog (PAD-507). */}
                  <DatePickerInput
                    testID="class-waiting-list-end-date"
                    value={expiresOn}
                    onChange={setExpiresOn}
                    portalHost={DIALOG_PORTAL_HOST}
                    error={periodValid ? undefined : t("players.endDateInvalid")}
                  />
                </View>
              )}
            </View>
          ) : null}
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={onClose} disabled={saving}>
            <Text>{t("common.cancel")}</Text>
          </Button>
          <Button testID="class-waiting-list-confirm" onPress={() => void confirm()} disabled={saving || !playerId || !periodValid}>
            <Text>{t(editing ? "common.save" : "calendar.detail.waitingListAdd")}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
