/**
 * classes.coach-requests-table rules 5, 7, 12 (PAD-795): the "Filtrar/Ordenar" sheet of iOS's
 * Pedidos de Aula. The coach edits a draft — sort key and direction, kind, status (the section's),
 * side, a student, class date / time range, request date range — and "Aplicar" hands it to the screen,
 * which sends what `coachRequestsQuery` builds from it: the params web sends for the same choices.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import {
  COACH_REQUESTS_SECTION_STATUSES,
  COACH_REQUESTS_SORT_KEYS,
  coachRequestStatusKey,
  coachRequestsActiveSort,
  type CoachRequestsView,
} from "@levelup/config";
import type { CoachRequestRow } from "@levelup/types";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Text } from "@/components/ui/text";
import { TimePickerInput } from "@/components/ui/time-picker-input";
import { cn } from "@/lib/utils";

export interface SheetStudent {
  id: string;
  label: string;
}

const SORT_LABEL: Record<(typeof COACH_REQUESTS_SORT_KEYS)[number], string> = {
  class_date: "classDay",
  class_time: "classTime",
  requested_at: "requestedDay",
  student: "student",
  kind: "kind",
  side: "side",
  status: "status",
};

function Chip({ id, label, selected, onPress }: { id: string; label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      testID={id}
      role="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn("rounded-full border px-3 py-1.5", selected ? "border-primary bg-primary" : "border-border bg-background")}
    >
      <Text className={cn("text-sm", selected && "text-primary-foreground")}>{label}</Text>
    </Pressable>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium">{title}</Text>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

export function CoachRequestsSheet({
  view,
  students,
  onApply,
  onClose,
}: {
  view: CoachRequestsView;
  students: SheetStudent[];
  onApply: (view: CoachRequestsView) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = React.useState<CoachRequestsView>(view);
  const [search, setSearch] = React.useState("");
  const set = (patch: Partial<CoachRequestsView>) => setDraft((d) => ({ ...d, ...patch }));
  const toggle = <K extends keyof CoachRequestsView>(key: K, value: CoachRequestsView[K]) =>
    set({ [key]: draft[key] === value ? undefined : value } as Partial<CoachRequestsView>);
  const sort = coachRequestsActiveSort(draft);
  const chosen = students.find((s) => s.id === draft.playerId);
  const matches = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? students.filter((s) => s.label.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [search, students]);

  const date = (id: string, key: keyof CoachRequestsView, label: string) => (
    <DatePickerInput testID={`coach-requests-sheet-${id}`} label={label} value={(draft[key] as string | undefined) ?? ""} onChange={(v) => set({ [key]: v || undefined } as Partial<CoachRequestsView>)} />
  );
  const time = (id: string, key: keyof CoachRequestsView, label: string) => (
    <TimePickerInput testID={`coach-requests-sheet-${id}`} label={label} value={(draft[key] as string | undefined) ?? ""} onChange={(v) => set({ [key]: v || undefined } as Partial<CoachRequestsView>)} />
  );

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-background" testID="coach-requests-sheet">
        <View className="flex-row items-center justify-between border-b border-border p-4">
          <Text className="text-base font-semibold">{t("classRequests.table.sheet.title")}</Text>
          <Pressable testID="coach-requests-sheet-close" role="button" accessibilityLabel={t("common.close")} hitSlop={12} onPress={onClose}>
            <Text className="text-sm text-muted-foreground">{t("common.close")}</Text>
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-5 p-4">
          <Group title={t("classRequests.table.sheet.sortBy")}>
            {COACH_REQUESTS_SORT_KEYS.map((key) => (
              <Chip
                key={key}
                id={`coach-requests-sheet-sort-${key}`}
                label={t(`classRequests.table.columns.${SORT_LABEL[key]}`)}
                selected={sort.by === key}
                onPress={() => set({ sortBy: key, sortDir: key === sort.by ? sort.dir : "asc" })}
              />
            ))}
          </Group>
          <Group title={t("classRequests.table.sheet.direction")}>
            {(["asc", "desc"] as const).map((dir) => (
              <Chip key={dir} id={`coach-requests-sheet-dir-${dir}`} label={t(`classRequests.table.sheet.${dir}`)} selected={sort.dir === dir} onPress={() => set({ sortBy: sort.by, sortDir: dir })} />
            ))}
          </Group>
          <Group title={t("classRequests.table.filters.kind")}>
            {(["academy", "private"] as const).map((kind) => (
              <Chip key={kind} id={`coach-requests-sheet-kind-${kind}`} label={t(`classRequests.table.kind.${kind}`)} selected={draft.kind === kind} onPress={() => toggle("kind", kind)} />
            ))}
          </Group>
          <Group title={t("classRequests.table.filters.status")}>
            {COACH_REQUESTS_SECTION_STATUSES[draft.section].map((status) => (
              <Chip
                key={status}
                id={`coach-requests-sheet-status-${status}`}
                label={t(coachRequestStatusKey("academy", status as CoachRequestRow["status"], null))}
                selected={draft.status === status}
                onPress={() => toggle("status", status)}
              />
            ))}
          </Group>
          <Group title={t("classRequests.table.filters.side")}>
            {(["left", "right", "both", "none"] as const).map((side) => (
              <Chip
                key={side}
                id={`coach-requests-sheet-side-${side}`}
                label={side === "none" ? t("classRequests.table.filters.sideNone") : t(side === "left" ? "players.sideLeft" : side === "right" ? "players.sideRight" : "players.sideBoth")}
                selected={draft.side === side}
                onPress={() => toggle("side", side)}
              />
            ))}
          </Group>
          <View className="gap-2">
            <Text className="text-sm font-medium">{t("classRequests.table.filters.student")}</Text>
            {chosen ? (
              <Chip id="coach-requests-sheet-student-chosen" label={chosen.label} selected onPress={() => set({ playerId: undefined })} />
            ) : (
              <>
                <TextInput
                  testID="coach-requests-sheet-student-search"
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t("classRequests.table.filters.studentSearch")}
                  autoCorrect={false}
                  className="h-10 rounded-md border border-input bg-background px-3 text-base"
                />
                <View className="flex-row flex-wrap gap-2">
                  {matches.map((s) => (
                    <Chip key={s.id} id={`coach-requests-sheet-student-${s.id}`} label={s.label} selected={false} onPress={() => { set({ playerId: s.id }); setSearch(""); }} />
                  ))}
                </View>
              </>
            )}
          </View>
          <View className="gap-2">
            <Text className="text-sm font-medium">{t("classRequests.table.filters.classDates")}</Text>
            {date("class-from", "classFrom", t("classRequests.table.filters.from"))}
            {date("class-to", "classTo", t("classRequests.table.filters.to"))}
          </View>
          <View className="gap-2">
            <Text className="text-sm font-medium">{t("classRequests.table.filters.classTimes")}</Text>
            {time("time-from", "classTimeFrom", t("classRequests.table.filters.from"))}
            {time("time-to", "classTimeTo", t("classRequests.table.filters.to"))}
          </View>
          <View className="gap-2">
            <Text className="text-sm font-medium">{t("classRequests.table.filters.requestDates")}</Text>
            {date("requested-from", "requestedFrom", t("classRequests.table.filters.from"))}
            {date("requested-to", "requestedTo", t("classRequests.table.filters.to"))}
          </View>
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border p-4">
          <Button
            variant="outline"
            className="flex-1"
            testID="coach-requests-sheet-clear"
            onPress={() => setDraft({ section: draft.section, sortBy: draft.sortBy, sortDir: draft.sortDir })}
          >
            <Text>{t("classRequests.table.filters.clear")}</Text>
          </Button>
          <Button className="flex-1" testID="coach-requests-sheet-apply" onPress={() => onApply(draft)}>
            <Text>{t("classRequests.table.sheet.apply")}</Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}
