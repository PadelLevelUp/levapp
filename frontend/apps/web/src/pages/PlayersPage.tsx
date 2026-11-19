import { publicWebLink, resolvePublicWebOrigin } from "@/lib/publicWebLink";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { queryKeys, useCoachLevels, useCoachPlayersPaginated } from "@levelup/hooks";
import {
  PLAYER_SEARCH_DEBOUNCE_MS,
  pendingAgeLabel,
  rosterFilterFromParams,
  rosterFilterQuery,
  type RosterFilter,
} from "@levelup/config";
import { SIDE_LABEL_KEYS } from "@/types";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Copy, UserPlus, X } from "lucide-react";

import { addPlayer } from "@/api/players";
import { createIncompletePlayer } from "@/api/playerInvitations";
import { PlayerSearchFeedback } from "@/components/players/PlayerSearchFeedback";
import { PlayersToolbar, type SortOption } from "@/components/players/PlayersToolbar";
import { AddPlayerSheet, type AddPlayerInput } from "@/components/players/AddPlayerSheet";
import { AddByQrDialog } from "@/components/players/AddByQrDialog";
import { LoadingPlayerCard } from "@/components/ui/loading-skeleton";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLayout } from "@/components/layout/LayoutContext";
import { PlayerDetailPane } from "./PlayerDetailPage";

export default function PlayersPage() {
  const queryClient = useQueryClient();
  const PAGE_SIZE = 25;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOption, setSortOption] = useState<SortOption>("name-asc");
  // players.list rule 5 (PAD-834): one filter at a time. The dashboard's "See all" opens
  // /players?incomplete=true (or missing_level / missing_side); the two alerts set
  // `incomplete` or `pending`. A URL with several keeps the first (rosterFilterFromParams).
  const [searchParams, setSearchParams] = useSearchParams();
  const [rosterFilter, setRosterFilter] = useState<RosterFilter | null>(() =>
    rosterFilterFromParams((name) => searchParams.get(name)),
  );
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { setScrollMode } = useLayout();
  // PAD-410: `/players` and `/players/:playerId` both render this page (the
  // MessagesPage pattern) so the roster's search/sort/page/filter state
  // survives a selection change — only the route param changes.
  const { playerId } = useParams<{ playerId?: string }>();
  const mobileView = playerId ? "detail" : "list";

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  // PAD-287: Settings → My connections lands here with `addByQr=1`.
  const [qrDialogOpen, setQrDialogOpen] = useState(
    () => new URLSearchParams(window.location.search).get("addByQr") === "1"
  );


  // Debounce search input (players.search rule 10: 200 ms) — reset page to 1 on new search
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value.trim());
      setCurrentPage(1);
    }, PLAYER_SEARCH_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // The list scrolls internally (below), the same way MessagesPage does —
  // both panes keep their own scroll position rather than the whole page
  // scrolling as one, so selecting a row never shifts either pane.
  useEffect(() => {
    setScrollMode("none");
    return () => setScrollMode("page");
  }, [setScrollMode]);

  // Levels are a shared query (client.query-cache rule 7); a failure keeps the list empty.
  const levels = useCoachLevels().data ?? [];

  // Parse sort option into API params
  const parseSortOption = (opt: SortOption) => {
    const [sortBy, sortDir] = opt.split("-") as ["name" | "level", "asc" | "desc"];
    return { sortBy, sortDir };
  };

  // client.query-cache (PAD-586): the roster page is a query keyed on page, search, sort and
  // filters. `keepPreviousData` keeps the rows on screen while the next page / search arrives
  // (rule 5), and a return within the stale window renders from cache with no request (rule 2).
  const { sortBy, sortDir } = parseSortOption(sortOption);
  const playersQuery = useCoachPlayersPaginated(
    {
      page: currentPage,
      perPage: PAGE_SIZE,
      search: debouncedSearch || undefined,
      sortBy,
      sortDir,
      ...rosterFilterQuery(rosterFilter),
    },
    { placeholderData: keepPreviousData },
  );
  const loading = playersQuery.isPending;
  const coachPlayers = playersQuery.data?.items ?? [];
  const totalPages = playersQuery.data?.pagination.pages || 1;
  const totalItems = playersQuery.data?.pagination.total || 0;
  // players.list rule 14 (PAD-834): an older server sends no `incomplete` / `pendingRegistration`.
  const incompleteCount = playersQuery.data?.alerts?.incomplete ?? 0;
  const pendingCount = playersQuery.data?.alerts?.pendingRegistration ?? 0;

  // Say why the list did not change (Session-E's review); the rows already on screen stay.
  // Read through refs, not dependencies: `t` changes identity when the language settles.
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const tRef = useRef(t);
  tRef.current = t;
  const listErrorAt = playersQuery.isError ? playersQuery.errorUpdatedAt : 0;
  useEffect(() => {
    if (listErrorAt) {
      toastRef.current({ variant: "destructive", title: tRef.current("players.listLoadFailed") });
    }
  }, [listErrorAt]);

  // Every roster write refreshes all pages and filters of the list and the shared roster, without
  // the list skeleton ("nothing moves under the finger"): the pane calls these after it edits or
  // removes the selected player.
  const invalidateRoster = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.coachPlayersPaginatedPrefix }),
        queryClient.invalidateQueries({ queryKey: queryKeys.coachRoster }),
      ]),
    [queryClient],
  );

  const handlePlayerUpdated = useCallback(() => {
    void invalidateRoster();
  }, [invalidateRoster]);

  const handlePlayerRemoved = useCallback(() => {
    navigate("/players");
    void invalidateRoster();
  }, [navigate, invalidateRoster]);

  const handleSortChange = (value: SortOption) => {
    setSortOption(value);
    setCurrentPage(1);
  };

  // The URL carries the one filter on screen, so a reload or a shared link keeps it.
  const applyRosterFilter = (next: RosterFilter | null) => {
    setRosterFilter(next);
    setCurrentPage(1);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        for (const name of ["pending", "incomplete", "missing_level", "missing_side"]) params.delete(name);
        if (next) params.set(next, "true");
        return params;
      },
      { replace: true },
    );
  };

  const toggleRosterFilter = (filter: RosterFilter) =>
    applyRosterFilter(rosterFilter === filter ? null : filter);

  const clearFilters = () => applyRosterFilter(null);

  const getInitials = (name: string) =>
    name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const refreshPlayersList = async () => {
    if (currentPage !== 1) setCurrentPage(1); // page 1's key loads
    await invalidateRoster();
  };

  const handleAddPlayer = async (data: AddPlayerInput) => {
    await addPlayer({ coachId: user?.coachId, ...data });
    await refreshPlayersList();
  };

  const handleInvitePlayer = async (data: {
    name: string;
    levelId?: string;
    side?: string;
    notes?: string;
    email?: string;
  }) => {
    const created = await createIncompletePlayer({ coachId: user?.coachId, ...data });
    // PAD-595: the environment's public origin (levapp.app), never the address browsed from.
    setInviteUrl(publicWebLink(await resolvePublicWebOrigin(queryClient), created.inviteLink));
    setInviteDialogOpen(true);
    // Refresh the list in the background without the full-page loading
    // skeleton, so the invite dialog stays mounted and visible.
    if (currentPage !== 1) setCurrentPage(1);
    await invalidateRoster();
  };

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast({ title: t("players.linkCopied") });
    } catch {
      toast({ variant: "destructive", title: t("players.linkCopyFailed") });
    }
  };

  const hasActiveFilter = rosterFilter !== null;

  const filterActiveLabel: Record<RosterFilter, string> = {
    pending: t("players.card.pendingFilterActive"),
    incomplete: t("players.incompleteFilterActive"),
    missing_level: t("players.missingLevelFilterActive"),
    missing_side: t("players.missingSideFilterActive"),
  };

  // players.list rule 5 (PAD-834): two alerts, and they are the filters. "Por configurar" is
  // amber; "registo pendente" a colour that is not amber.
  const alertsSection = (incompleteCount > 0 || pendingCount > 0) && (
    <div className="flex flex-col gap-2">
      {incompleteCount > 0 && (
        <Alert
          data-testid="players-alert-incomplete"
          data-tone="warning"
          data-active={rosterFilter === "incomplete" ? "true" : "false"}
          role="button"
          tabIndex={0}
          aria-pressed={rosterFilter === "incomplete"}
          className={`cursor-pointer transition-colors ${
            rosterFilter === "incomplete"
              ? "border-warning/40 bg-warning/10 dark:bg-warning/10"
              : "hover:border-warning/40"
          }`}
          onClick={() => toggleRosterFilter("incomplete")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleRosterFilter("incomplete");
            }
          }}
        >
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="ml-2">
            {t("players.card.alertIncomplete", { count: incompleteCount })}
          </AlertDescription>
        </Alert>
      )}
      {pendingCount > 0 && (
        <Alert
          data-testid="players-alert-pending"
          data-tone="pending"
          data-active={rosterFilter === "pending" ? "true" : "false"}
          role="button"
          tabIndex={0}
          aria-pressed={rosterFilter === "pending"}
          className={`cursor-pointer transition-colors border-violet-300 dark:border-violet-800 ${
            rosterFilter === "pending"
              ? "bg-violet-100 dark:bg-violet-950"
              : "hover:bg-violet-50 dark:hover:bg-violet-950/50"
          }`}
          onClick={() => toggleRosterFilter("pending")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleRosterFilter("pending");
            }
          }}
        >
          <UserPlus className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          <AlertDescription className="ml-2">
            {t("players.card.alertPending", { count: pendingCount })}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );

  const listPane = (
    <div className="p-4 space-y-4 h-full overflow-y-auto">
      <PlayersToolbar
        search={search}
        onSearchChange={handleSearchChange}
        onAddPlayer={() => setIsAddOpen(true)}
        onAddByQr={() => setQrDialogOpen(true)}
        sortOption={sortOption}
        onSortChange={handleSortChange}
      />

      {alertsSection}

      {hasActiveFilter && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm" data-testid="players-filter-active">
            {rosterFilter ? filterActiveLabel[rosterFilter] : null}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            data-testid="players-filter-clear"
            aria-label={t("players.clearFilterAriaLabel")}
          >
            <X className="w-4 h-4 mr-1" />
            {t("players.card.seeAll")}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2" data-testid="players-list-loading">
          {[...Array(6)].map((_, i) => (
            <LoadingPlayerCard key={i} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2" data-testid="players-list">
          {coachPlayers.map((cs) => {
            const level = cs.level;
            const isSelected = playerId != null && String(cs.playerId) === String(playerId);
            const pending = cs.pendingRegistration === true;
            const age = pending ? pendingAgeLabel(cs.addedAt) : null;
            return (
              <Card
                key={`coach-player-${cs.id}-${cs.playerId}`}
                data-testid={`player-card-${cs.playerId}`}
                // players.list rule 15 (PAD-834): pending is the placeholder, not `!validated`.
                data-pending={pending ? "true" : "false"}
                data-selected={isSelected ? "true" : "false"}
                aria-current={isSelected ? "true" : undefined}
                // PAD-148 / R-026: the card is the only route to a player's
                // detail page, so it has to be a real control. `role="button"`
                // rather than a native <button> because Card and CardContent
                // render <div>s, which a <button> may not contain. Same key as
                // iOS uses on its Pressable, so the two shells share the string.
                role="button"
                tabIndex={0}
                aria-label={t("players.openPlayerAria", { name: cs.displayName || cs.name })}
                className={`cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isSelected ? "bg-accent" : "hover:bg-accent/50"
                } ${pending ? "opacity-60" : ""}`}
                onClick={() => navigate(`/players/${cs.playerId}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    // Without preventDefault, Space scrolls the roster instead.
                    e.preventDefault();
                    navigate(`/players/${cs.playerId}`);
                  }
                }}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Avatar
                      className={`w-10 h-10 shrink-0 ${pending ? "border-2 border-dashed border-violet-400" : ""}`}
                      data-testid={pending ? "player-row-avatar-pending" : undefined}
                    >
                      <AvatarFallback
                        className={`font-bold text-sm ${
                          pending ? "bg-transparent text-muted-foreground" : "bg-primary text-primary-foreground"
                        }`}
                      >
                        {getInitials(cs.displayName || cs.name || "")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p
                        data-testid={`player-card-name-${cs.playerId}`}
                        className={`font-medium truncate ${
                          pending ? "text-muted-foreground" : ""
                        }`}
                      >
                        {cs.displayName || cs.name}
                      </p>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        {level && (
                          <Badge variant="outline" className="text-xs" data-testid={`player-level-chip-${cs.playerId}`}>
                            {t("players.masterDetail.levelChip", { code: level.code })}
                          </Badge>
                        )}
                        {cs.side && (
                          <Badge variant="secondary" className="text-xs" data-testid={`player-side-chip-${cs.playerId}`}>{t(SIDE_LABEL_KEYS[cs.side])}</Badge>
                        )}
                        {/* players.list rule 15 (PAD-834): the needs-configuring chips, amber. */}
                        {!cs.levelId && (
                          <Badge variant="outline" className="border-warning/40 text-warning-strong bg-warning/10 text-xs" data-testid="player-row-no-level">
                            {t("players.card.noLevel")}
                          </Badge>
                        )}
                        {!cs.side && (
                          <Badge variant="outline" className="border-warning/40 text-warning-strong bg-warning/10 text-xs" data-testid="player-row-no-side">
                            {t("players.card.noSide")}
                          </Badge>
                        )}
                        {age && (
                          <Badge
                            variant="outline"
                            className="border-violet-300 text-violet-700 dark:border-violet-800 dark:text-violet-300 text-xs"
                            data-testid="pending-registration-badge"
                          >
                            {t(age.key, age.values)}
                          </Badge>
                        )}
                        {/* players.claim rule 4c (PAD-528): the server's duplicate flag on a claimable row; nothing re-sorts. */}
                        {cs.possibleDuplicateOf && (
                          <Badge
                            variant="outline"
                            className="border-warning/40 text-warning text-xs"
                            data-testid={`player-duplicate-${cs.playerId}`}
                            title={t("players.claim.possibleDuplicateHint", { name: cs.possibleDuplicateOf.name })}
                          >
                            {t("players.claim.possibleDuplicate")}
                          </Badge>
                        )}
                        {/* evaluations.reminders rule 4 (PAD-404): the server's `due`; the list is not re-sorted by it. */}
                        {cs.due === true && (
                          <Badge
                            variant="outline"
                            className="border-primary/40 text-primary text-xs"
                            data-testid={`player-due-${cs.playerId}`}
                            aria-label={t("evaluations.reminder.dueLabel")}
                          >
                            {t("evaluations.reminder.dueLabel")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* players.search rule 10: "searching" until the request for the typed text lands (the rows stay). */}
      <PlayerSearchFeedback
        query={search}
        searching={search.trim() !== debouncedSearch || (debouncedSearch !== "" && playersQuery.isFetching)}
        count={totalItems}
      />

      <div className="flex items-center justify-between pt-2">
        {/* B-524: the total as data, so a spec can wait for a search's result without matching copy. */}
        <p className="text-sm text-muted-foreground" data-testid="players-pagination" data-total={totalItems}>
          {t("players.pagination", { current: currentPage, total: totalPages, players: totalItems })}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            {t("common.previous")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            {t("common.next")}
          </Button>
        </div>
      </div>
    </div>
  );

  const detailPane = !playerId ? (
    <div
      className="flex-1 grid place-items-center p-6 h-full"
      data-testid="player-detail-placeholder"
    >
      <div className="text-center">
        <p className="font-medium">{t("players.masterDetail.selectPlayer")}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {t("players.masterDetail.selectPlayerHint")}
        </p>
      </div>
    </div>
  ) : (
    <div className="flex-1 min-w-0 h-full overflow-y-auto">
      <PlayerDetailPane
        // Keyed by player: a new selection starts its own load/edit state
        // rather than inheriting the previous player's (rule 10, shared with
        // the evaluations drawer).
        key={playerId}
        playerId={playerId}
        onRemoved={handlePlayerRemoved}
        onUpdated={handlePlayerUpdated}
      />
    </div>
  );

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="flex h-full min-h-0">
          {/* Roster (master) */}
          <div
            data-testid="players-list-pane"
            className={
              isMobile
                ? mobileView === "list"
                  ? "block w-full h-full"
                  : "hidden"
                : "flex flex-col w-80 lg:w-96 shrink-0 border-r h-full"
            }
          >
            {listPane}
          </div>

          {/* Player detail */}
          <div
            data-testid="player-detail-pane"
            className={
              isMobile
                ? mobileView === "detail"
                  ? "flex flex-1 h-full"
                  : "hidden"
                : "flex flex-1 min-w-0 h-full"
            }
          >
            {detailPane}
          </div>
        </div>
      </div>

      <AddPlayerSheet
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSave={handleAddPlayer}
        onInvite={handleInvitePlayer}
        levels={levels}
        coachId={user?.coachId}
      />

      <AddByQrDialog open={qrDialogOpen} onOpenChange={setQrDialogOpen} />

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("players.inviteDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("players.inviteDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={inviteUrl ?? ""} />
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopyInvite}
              aria-label={t("players.copyInviteAriaLabel")}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
