/**
 * classes.coach-requests-table (PAD-795) rule 12: the coach's Pedidos de Aula as a screen of its own
 * (route `class-requests`, opened from Settings' `settings-nav-classRequests`). Same endpoint, tabs
 * with counts, fields and filters as web's table, in compact rows; one "Filtrar/Ordenar" sheet;
 * pages load one after another as the list scrolls to its end. The first page is a query the request
 * events refresh (rule 14): a refresh reads page 1 again and drops the pages appended after it.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { FlatList, Pressable, TextInput, View } from "react-native";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  clubDateOfInstant,
  clubTimeOfInstant,
  coachRequestStatusKey,
  coachRequestsQuery,
  formatShortDate,
  switchCoachRequestsSection,
  type CoachRequestsView,
} from "@levelup/config";
import { queryKeys } from "@levelup/hooks";
import type { CoachRequestRow, CoachRequestsPage, CoachRequestsSection } from "@levelup/types";
import * as coachRequestsApi from "@levelup/api/src/resources/coachRequests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { JoinRequestSide } from "@/features/calendar/join-request-side";
import { PlayerSearchFeedback } from "@/features/players/player-search-feedback";
import { useDebouncedText } from "@/lib/useDebouncedText";
import { nativeLocaleTag } from "@/lib/native-locale";
import { cn } from "@/lib/utils";
import { CoachRequestsSheet } from "./coach-requests-sheet";
import { useCoachRequestActions } from "./use-coach-request-actions";

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "accepted") return "default";
  if (status === "declined" || status === "rejected") return "destructive";
  if (status === "withdrawn" || status === "superseded") return "outline";
  return "secondary";
}

const keyOf = (r: Pick<CoachRequestRow, "kind" | "id">) => `${r.kind}-${r.id}`;

/** A request instant in the club's zone: the language's short date, then HH:MM. */
function when(iso: string | null, tag: string): string {
  return iso ? `${formatShortDate(clubDateOfInstant(iso), tag)} ${clubTimeOfInstant(iso)}` : "—";
}

export function CoachRequestsScreen({ proposeFor }: { /** Rule 16: open the propose form on this request (from the chat bubble). */ proposeFor?: number | null }) {
  const { t, i18n } = useTranslation();
  const tag = nativeLocaleTag(i18n?.language);
  const [chosen, setView] = React.useState<CoachRequestsView>({ section: "open" });
  // Rule 7 `search` / players.search rule 10: the box answers on each keystroke, the server 200 ms after the last.
  const [searchText, setSearchText] = React.useState("");
  const { debounced, settling } = useDebouncedText(searchText);
  const view = React.useMemo<CoachRequestsView>(() => ({ ...chosen, search: debounced || undefined }), [chosen, debounced]);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const { actionsFor, panel, openProposal } = useCoachRequestActions();

  const first = useQuery({
    queryKey: queryKeys.coachRequests(coachRequestsQuery(view, 1)),
    queryFn: () => coachRequestsApi.listCoachRequests(coachRequestsQuery(view, 1)),
    placeholderData: keepPreviousData,
  });

  // Pages after the first, loaded as the list ends. A new read of page 1 (a refresh, a new view)
  // drops them: the list shows page 1 until it is scrolled again (rule 14).
  const [more, setMore] = React.useState<{ rows: CoachRequestRow[]; pagination: CoachRequestsPage["pagination"] } | null>(null);
  const loadingMore = React.useRef(false);
  // The read page 1 belongs to: a page that lands after the view or the first page changed is stale.
  const viewKey = React.useRef("");
  viewKey.current = `${JSON.stringify(coachRequestsQuery(view, 1))}@${first.dataUpdatedAt}`;
  React.useEffect(() => setMore(null), [first.dataUpdatedAt, view]);

  const pagination = more?.pagination ?? first.data?.pagination;
  const items = React.useMemo(() => [...(first.data?.items ?? []), ...(more?.rows ?? [])], [first.data, more]);
  const counts = first.data?.counts ?? { open: 0, history: 0 };

  const loadMore = async () => {
    if (loadingMore.current || first.isFetching || !pagination?.hasNext) return;
    loadingMore.current = true;
    const next = pagination.page + 1;
    const started = viewKey.current;
    try {
      const res = await coachRequestsApi.listCoachRequests(coachRequestsQuery(view, next));
      if (viewKey.current !== started) return; // S4: the coach moved on (tab, sort, filter, refresh)
      setMore((prev) => ({ rows: [...(prev?.rows ?? []), ...res.items], pagination: res.pagination }));
    } catch {
      // The next end-of-list tries again.
    } finally {
      loadingMore.current = false;
    }
  };

  // Rule 16: "Propose another time" from the chat reads that one request, whatever page it is on.
  const openRef = React.useRef(openProposal);
  openRef.current = openProposal;
  React.useEffect(() => {
    if (!proposeFor) return;
    let live = true;
    coachRequestsApi
      .listCoachRequests({ kind: "private", id: proposeFor })
      .then((res) => {
        const found = res.items[0];
        if (live && found && found.kind === "private" && found.status === "pending") openRef.current(found);
      })
      .catch(() => undefined)
      // Rule 16: the param is spent whether or not a form opened.
      .finally(() => router.setParams({ proposeFor: undefined }));
    return () => {
      live = false;
    };
  }, [proposeFor]);

  const switchTab = (section: CoachRequestsSection) => {
    if (section === view.section) return;
    setOpenKey(null);
    setView((v) => switchCoachRequestsSection(v, section));
  };

  const hasFilters = Boolean(
    view.kind || view.status || view.side || view.playerId || view.classFrom || view.classTo || view.classTimeFrom || view.classTimeTo || view.requestedFrom || view.requestedTo
  );

  const detail = (r: CoachRequestRow) => {
    const who = r.decidedBy === "student" ? t("classRequests.table.detail.student") : r.decidedBy === "coach" ? t("classRequests.table.detail.coach") : "—";
    return (
      <View className="gap-1 rounded-md bg-muted/40 p-2" testID="coach-request-detail">
        <Text className="text-sm italic" testID="coach-request-detail-note">{r.note ? `“${r.note}”` : t("classRequests.table.detail.none")}</Text>
        <Text className="text-sm" testID="coach-request-detail-requested-at">{t("classRequests.table.detail.requestedAt", { when: when(r.createdAt, tag) })}</Text>
        <Text className="text-sm" testID="coach-request-detail-decided-at">{t("classRequests.table.detail.decidedAt", { when: when(r.decidedAt, tag) })}</Text>
        <Text className="text-sm" testID="coach-request-detail-decided-by">{t("classRequests.table.detail.decidedBy", { who })}</Text>
        {r.recurrence ? (
          <Text className="text-sm" testID="coach-request-detail-recurrence">
            {t("classRequests.table.detail.recurrence", {
              days: r.recurrence.weekdays.map((d) => t(`classRequestWizard.weekdays.${d}`)).join(", "),
              end: formatShortDate(r.recurrence.endDate, tag),
            })}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderRow = ({ item: r }: { item: CoachRequestRow }) => {
    const k = keyOf(r);
    const expanded = openKey === k;
    return (
      <View className="gap-2 rounded-lg border border-border bg-card p-3" key={k}>
        <Pressable testID={`coach-request-row-${k}`} role="button" onPress={() => setOpenKey(expanded ? null : k)} className="gap-1">
          <View className="flex-row items-start justify-between gap-2">
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="font-medium" testID={`coach-request-student-${k}`}>{r.displayName}</Text>
              <Text className="text-sm" testID={`coach-request-class-${k}`}>
                {r.date ? formatShortDate(r.date, tag) : "—"} · {r.startTime ? `${r.startTime}–${r.endTime ?? ""}` : "—"}
              </Text>
              <Text className="text-xs text-muted-foreground" testID={`coach-request-requested-${k}`}>
                {when(r.createdAt, tag)}
              </Text>
            </View>
            <Badge variant={statusVariant(r.status)}>
              <Text testID={`coach-request-status-${k}`}>{t(coachRequestStatusKey(r.kind, r.status, r.decidedBy))}</Text>
            </Badge>
          </View>
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge variant="outline" testID={`coach-request-kind-badge-${r.kind}-${r.status}`}>
              <Text testID={`coach-request-kind-${k}`}>{t(`classRequests.table.kind.${r.kind}`)}</Text>
            </Badge>
            {r.classTitle ? <Text className="text-sm text-muted-foreground">{r.classTitle}</Text> : null}
            {/* The side once: the chip (with "Usar … no perfil") while the request is open, else its word. */}
            {r.side && r.status === "pending" ? (
              <View testID={`coach-request-side-${k}`}>
                <JoinRequestSide request={{ coachId: r.coachId, playerId: r.playerId, side: r.side, suggestedProfileSide: r.suggestedProfileSide }} />
              </View>
            ) : (
              <Text className="text-sm text-muted-foreground" testID={`coach-request-side-${k}`}>
                {r.side ? t(r.side === "left" ? "players.sideLeft" : r.side === "right" ? "players.sideRight" : "players.sideBoth") : "—"}
              </Text>
            )}
          </View>
        </Pressable>
        {actionsFor(r)}
        {expanded ? detail(r) : null}
      </View>
    );
  };

  const header = (
    <View className="gap-3 pb-3">
      <Text className="text-xs text-muted-foreground">{t("classRequests.coachIntro")}</Text>
      {panel}
      <View className="flex-row gap-2">
        {(["open", "history"] as const).map((s) => (
          <Pressable
            key={s}
            testID={`coach-requests-tab-${s}`}
            role="tab"
            accessibilityState={{ selected: view.section === s }}
            onPress={() => switchTab(s)}
            className={cn("flex-1 items-center rounded-md border px-3 py-2", view.section === s ? "border-primary bg-primary/10" : "border-border bg-background")}
          >
            <Text className={cn("text-sm", view.section === s ? "font-semibold" : "text-muted-foreground")}>
              {t(s === "open" ? "classRequests.table.tabOpen" : "classRequests.table.tabHistory")} ({counts[s]})
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        testID="coach-requests-search"
        value={searchText}
        onChangeText={setSearchText}
        placeholder={t("classRequests.table.filters.studentSearch")}
        accessibilityLabel={t("classRequests.table.filters.student")}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        returnKeyType="search"
        className="h-10 rounded-md border border-input bg-background px-3 text-base"
      />
      {/* players.search rule 10: "searching" while the text settles or its answer is on the way, "nobody" when it came back empty. */}
      <PlayerSearchFeedback query={searchText} searching={settling || first.isPlaceholderData} count={items.length} className="text-sm text-muted-foreground" />
      <Button variant="outline" size="sm" onPress={() => setSheetOpen(true)} testID="coach-requests-filter-open">
        <Text>{t("classRequests.table.sheet.open")}{hasFilters ? " •" : ""}</Text>
      </Button>
    </View>
  );

  return (
    <View className="flex-1" testID="class-requests">
      <FlatList
        testID="coach-requests-list"
        data={items}
        keyExtractor={keyOf}
        renderItem={renderRow}
        ListHeaderComponent={header}
        ListEmptyComponent={
          first.isPending ? (
            <Text className="text-sm text-muted-foreground">…</Text>
          ) : first.isError ? (
            <Text className="text-sm text-destructive">{t("classRequests.loadFailed")}</Text>
          ) : searchText.trim() ? null : (
            <Text className="text-sm text-muted-foreground" testID="coach-requests-empty">{t("classRequests.table.empty")}</Text>
          )
        }
        ItemSeparatorComponent={() => <View className="h-2" />}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      />
      {sheetOpen ? (
        <CoachRequestsSheet
          view={chosen}
          onClose={() => setSheetOpen(false)}
          onApply={(next) => {
            setSheetOpen(false);
            setOpenKey(null);
            setView(next);
          }}
        />
      ) : null}
    </View>
  );
}
