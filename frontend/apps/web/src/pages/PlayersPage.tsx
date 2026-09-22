import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { CoachPlayer, CoachLevel } from "@/types";
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
import { AlertTriangle, Copy, X } from "lucide-react";

import { getCoachPlayersPaginated, addPlayer } from "@/api/players";
import { createIncompletePlayer } from "@/api/playerInvitations";
import { getCoachLevels } from "@/api/coachLevel";
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
  const PAGE_SIZE = 25;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [sortOption, setSortOption] = useState<SortOption>("name-asc");
  const [missingLevelFilter, setMissingLevelFilter] = useState(false);
  const [missingSideFilter, setMissingSideFilter] = useState(false);
  const [alertCounts, setAlertCounts] = useState({ missingLevel: 0, missingSide: 0 });
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

  const [coachPlayers, setCoachPlayers] = useState<CoachPlayer[]>([]);
  const [levels, setLevels] = useState<CoachLevel[]>([]);

  // Debounce search input — reset page to 1 on new search
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value.trim());
      setCurrentPage(1);
    }, 300);
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

  useEffect(() => {
    async function loadLevels() {
      try {
        const levelsData = await getCoachLevels();
        setLevels(levelsData);
      } catch {
        // Keep empty levels on failure.
      }
    }
    loadLevels();
  }, []);

  // Parse sort option into API params
  const parseSortOption = (opt: SortOption) => {
    const [sortBy, sortDir] = opt.split("-") as ["name" | "level", "asc" | "desc"];
    return { sortBy, sortDir };
  };

  const fetchPlayersPage = useCallback(
    async (page: number) => {
      const searchParam = debouncedSearch || undefined;
      const { sortBy, sortDir } = parseSortOption(sortOption);
      return getCoachPlayersPaginated(
        page, PAGE_SIZE, searchParam,
        sortBy, sortDir,
        missingLevelFilter, missingSideFilter,
      );
    },
    [debouncedSearch, sortOption, missingLevelFilter, missingSideFilter],
  );

  // PAD-410: every roster fetch goes through here. Each request takes a sequence
  // number and only the newest one may write the list, so a slow refresh can never
  // overwrite a newer search result (a create-then-search raced that way). Every fetch
  // uses the list's current search, sort and filters: the list keeps its state.
  const requestSeq = useRef(0);
  const loadPage = useCallback(
    async (page: number, { showSkeleton }: { showSkeleton: boolean }) => {
      const mine = ++requestSeq.current;
      if (showSkeleton) setLoading(true);
      try {
        const playersData = await fetchPlayersPage(page);
        if (mine !== requestSeq.current) return;
        setCoachPlayers(playersData.items);
        setTotalPages(playersData.pagination.pages || 1);
        setTotalItems(playersData.pagination.total || 0);
        if (playersData.alerts) {
          setAlertCounts(playersData.alerts);
        }
      } catch {
        // Keep the current rows; a later fetch replaces them.
      } finally {
        if (showSkeleton && mine === requestSeq.current) setLoading(false);
      }
    },
    [fetchPlayersPage],
  );

  useEffect(() => {
    void loadPage(currentPage, { showSkeleton: true });
  }, [currentPage, loadPage]);

  // A background refresh of the CURRENT page, without the list skeleton, for the pane to call
  // after it edits or removes the selected player: the row catches up and the list keeps
  // its search, sort, page and filter ("nothing moves under the finger").
  const silentRefetchCurrentPage = useCallback(
    () => loadPage(currentPage, { showSkeleton: false }),
    [loadPage, currentPage],
  );

  const handlePlayerUpdated = useCallback(() => {
    void silentRefetchCurrentPage();
  }, [silentRefetchCurrentPage]);

  const handlePlayerRemoved = useCallback(() => {
    navigate("/players");
    void silentRefetchCurrentPage();
  }, [navigate, silentRefetchCurrentPage]);

  const handleSortChange = (value: SortOption) => {
    setSortOption(value);
    setCurrentPage(1);
  };

  const toggleMissingLevelFilter = () => {
    setMissingLevelFilter((prev) => !prev);
    setMissingSideFilter(false);
    setCurrentPage(1);
  };

  const toggleMissingSideFilter = () => {
    setMissingSideFilter((prev) => !prev);
    setMissingLevelFilter(false);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setMissingLevelFilter(false);
    setMissingSideFilter(false);
    setCurrentPage(1);
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const refreshPlayersList = async () => {
    if (currentPage !== 1) setCurrentPage(1); // the effect loads page 1
    else await loadPage(1, { showSkeleton: true });
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
    setInviteUrl(`${window.location.origin}${created.inviteLink}`);
    setInviteDialogOpen(true);
    // Refresh the list in the background without the full-page loading
    // skeleton, so the invite dialog stays mounted and visible.
    if (currentPage !== 1) setCurrentPage(1);
    else await loadPage(1, { showSkeleton: false });
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

  const hasActiveFilter = missingLevelFilter || missingSideFilter;

  const alertsSection = (alertCounts.missingLevel > 0 || alertCounts.missingSide > 0) && (
    <div className="flex flex-col gap-2">
      {alertCounts.missingLevel > 0 && (
        <Alert
          className={`cursor-pointer transition-colors ${
            missingLevelFilter
              ? "border-warning/40 bg-warning/10 dark:bg-warning/10"
              : "hover:border-warning/40"
          }`}
          onClick={toggleMissingLevelFilter}
        >
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="ml-2">
            {t("players.missingLevelAlert", { count: alertCounts.missingLevel })}
          </AlertDescription>
        </Alert>
      )}
      {alertCounts.missingSide > 0 && (
        <Alert
          className={`cursor-pointer transition-colors ${
            missingSideFilter
              ? "border-warning/40 bg-warning/10 dark:bg-warning/10"
              : "hover:border-warning/40"
          }`}
          onClick={toggleMissingSideFilter}
        >
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="ml-2">
            {t("players.missingSideAlert", { count: alertCounts.missingSide })}
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
          <Badge variant="secondary" className="text-sm">
            {missingLevelFilter ? t("players.missingLevelFilterActive") : t("players.missingSideFilterActive")}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            aria-label={t("players.clearFilterAriaLabel")}
          >
            <X className="w-4 h-4 mr-1" />
            {t("players.clearFilter")}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <LoadingPlayerCard key={i} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2" data-testid="players-list">
          {coachPlayers.map((cs) => {
            const level = cs.level;
            const isSelected = playerId != null && String(cs.playerId) === String(playerId);
            return (
              <Card
                key={`coach-player-${cs.id}-${cs.playerId}`}
                data-testid={`player-card-${cs.playerId}`}
                data-validated={cs.validated ? "true" : "false"}
                data-selected={isSelected ? "true" : "false"}
                aria-current={isSelected ? "true" : undefined}
                // PAD-148 / R-026: the card is the only route to a player's
                // detail page, so it has to be a real control. `role="button"`
                // rather than a native <button> because Card and CardContent
                // render <div>s, which a <button> may not contain. Same key as
                // iOS uses on its Pressable, so the two shells share the string.
                role="button"
                tabIndex={0}
                aria-label={t("players.openPlayerAria", { name: cs.name })}
                className={`cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isSelected ? "bg-accent" : "hover:bg-accent/50"
                } ${cs.validated ? "" : "opacity-60"}`}
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
                    <Avatar className="w-10 h-10 shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground font-bold text-sm">
                        {getInitials(cs.name || "")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-medium truncate ${
                          cs.validated ? "" : "text-muted-foreground"
                        }`}
                      >
                        {cs.name}
                      </p>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        {level && (
                          <Badge variant="outline" className="text-xs">
                            {t("players.masterDetail.levelChip", { code: level.code })}
                          </Badge>
                        )}
                        {cs.side && (
                          <Badge variant="secondary" className="text-xs">{t(SIDE_LABEL_KEYS[cs.side])}</Badge>
                        )}
                        {!cs.validated && (
                          <Badge
                            variant="outline"
                            className="border-warning/40 text-warning text-xs"
                            data-testid="pending-registration-badge"
                          >
                            {t("players.pendingRegistration")}
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

      <div className="flex items-center justify-between pt-2">
        <p className="text-sm text-muted-foreground">
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
