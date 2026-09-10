import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
import { LoadingPlayersGrid } from "@/components/ui/loading-skeleton";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/hooks/use-toast";

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

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);

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

  useEffect(() => {
    async function loadPlayersPage() {
      setLoading(true);
      try {
        const searchParam = debouncedSearch || undefined;
        const { sortBy, sortDir } = parseSortOption(sortOption);
        const playersData = await getCoachPlayersPaginated(
          currentPage, PAGE_SIZE, searchParam,
          sortBy, sortDir,
          missingLevelFilter, missingSideFilter,
        );
        setCoachPlayers(playersData.items);
        setTotalPages(playersData.pagination.pages || 1);
        setTotalItems(playersData.pagination.total || 0);
        if (playersData.alerts) {
          setAlertCounts(playersData.alerts);
        }
      } finally {
        setLoading(false);
      }
    }
    loadPlayersPage();
  }, [currentPage, debouncedSearch, sortOption, missingLevelFilter, missingSideFilter]);

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
    setCurrentPage(1);
    setLoading(true);
    try {
      const { sortBy, sortDir } = parseSortOption(sortOption);
      const playersData = await getCoachPlayersPaginated(1, PAGE_SIZE, undefined, sortBy, sortDir);
      setCoachPlayers(playersData.items);
      setTotalPages(playersData.pagination.pages || 1);
      setTotalItems(playersData.pagination.total || 0);
      if (playersData.alerts) {
        setAlertCounts(playersData.alerts);
      }
    } finally {
      setLoading(false);
    }
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
    try {
      const { sortBy, sortDir } = parseSortOption(sortOption);
      const playersData = await getCoachPlayersPaginated(1, PAGE_SIZE, undefined, sortBy, sortDir);
      setCurrentPage(1);
      setCoachPlayers(playersData.items);
      setTotalPages(playersData.pagination.pages || 1);
      setTotalItems(playersData.pagination.total || 0);
      if (playersData.alerts) {
        setAlertCounts(playersData.alerts);
      }
    } catch {
      // Non-fatal — the invite already succeeded.
    }
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
    <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
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

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <PlayersToolbar
            search={search}
            onSearchChange={handleSearchChange}
            onAddPlayer={() => setIsAddOpen(true)}
            onAddByQr={() => setQrDialogOpen(true)}
            sortOption={sortOption}
            onSortChange={handleSortChange}
          />
          <div className="relative h-full">
            <LoadingPlayersGrid />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coachPlayers.map((cs) => {
            const level = cs.level;
            return (
              <Card
                key={`coach-player-${cs.id}-${cs.playerId}`}
                data-testid={`player-card-${cs.playerId}`}
                data-validated={cs.validated ? "true" : "false"}
                // PAD-148 / R-026: the card is the only route to a player's
                // detail page, so it has to be a real control. `role="button"`
                // rather than a native <button> because Card and CardContent
                // render <div>s, which a <button> may not contain. Same key as
                // iOS uses on its Pressable, so the two shells share the string.
                role="button"
                tabIndex={0}
                aria-label={t("players.openPlayerAria", { name: cs.name })}
                className={`cursor-pointer hover:shadow-md transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  cs.validated ? "" : "opacity-60"
                }`}
                onClick={() => navigate(`/players/${cs.playerId}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    // Without preventDefault, Space scrolls the roster instead.
                    e.preventDefault();
                    navigate(`/players/${cs.playerId}`);
                  }
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className="bg-primary text-primary-foreground font-bold">
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
                      <p className="text-sm text-muted-foreground truncate">{cs.email || "—"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {level && <Badge variant="outline">{level.code}</Badge>}
                    {cs.side && (
                      <Badge variant="secondary">{t(SIDE_LABEL_KEYS[cs.side])}</Badge>
                    )}
                    {!cs.validated && (
                      <Badge variant="outline" className="border-warning/40 text-warning">
                        {t("players.pendingRegistration")}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

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
      </div>
    </AppLayout>
  );
}
