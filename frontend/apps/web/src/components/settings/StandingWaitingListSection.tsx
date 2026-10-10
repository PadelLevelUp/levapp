import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { standingEndLabel } from "@levelup/config";
import { getStandingWaitingList, removeFromStandingWaitingList, searchPlayers } from "@/api/notificationEngine";
import { AddToStandingWaitingListDialog } from "@/components/players/AddToStandingWaitingListDialog";
import type { StandingWaitingListEntry } from "@/types";

export function StandingWaitingListSection() {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<StandingWaitingListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: number; name: string } | null>(null);
  // PAD-507: the entry being renewed (its end date moves; credits stay).
  const [renewing, setRenewing] = useState<StandingWaitingListEntry | null>(null);

  // Player search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getStandingWaitingList()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearchOpen(false);
      return;
    }
    if (searchRef.current) clearTimeout(searchRef.current);
    setSearching(true);
    searchRef.current = setTimeout(async () => {
      try {
        const data = await searchPlayers(query);
        setResults(data.players);
        setSearchOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query]);

  const handleSelectPlayer = (p: { id: string; name: string }) => {
    setSelectedPlayer({ id: Number(p.id), name: p.name });
    setQuery("");
    setResults([]);
    setSearchOpen(false);
    setDialogOpen(true);
  };

  const handleAdded = (entry: StandingWaitingListEntry) => {
    setEntries((prev) => {
      const filtered = prev.filter((e) => e.playerId !== entry.playerId);
      return [...filtered, entry];
    });
    setSelectedPlayer(null);
    setRenewing(null);
  };

  const [removingId, setRemovingId] = useState<number | null>(null);

  const handleRemove = async (entryId: number) => {
    setRemovingId(entryId);
    try {
      await removeFromStandingWaitingList(entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch {
      // Reload on failure
      getStandingWaitingList().then(setEntries);
    } finally {
      setRemovingId(null);
    }
  };

  /**
   * `expires_at` is stored as a naive UTC datetime and serialized with `.isoformat()`, so it
   * arrives without a `Z` or an offset (e.g. "2026-09-03T12:34:56.789012"). `new Date()` reads
   * that offset-less form as *local* time, which skews it by the host's UTC offset. Normalize to
   * UTC before parsing so the displayed date and the expiry comparison agree with each other.
   */
  const parseExpiry = (iso: string) =>
    new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`);

  /** PAD-507: the date the entry runs to (inclusive) — with the year, since it can be up to 12 months out. */
  const formatExpiry = (entry: StandingWaitingListEntry) =>
    entry.expiresOn
      ? standingEndLabel(entry.expiresOn, i18n.language)
      : parseExpiry(entry.expiresAt).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" });

  /**
   * `expires_at` is an instant, not a calendar date, so an entry expiring later today is not yet
   * expired — "expires today" is not a distinct state.
   */
  const isExpired = (iso: string) => parseExpiry(iso).getTime() < Date.now();

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("settings.standingList.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Player search */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <Input
            placeholder={t("settings.standingList.searchToAdd")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="text-sm h-8"
          />
          {searching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
        {searchOpen && results.length > 0 && (
          <div className="absolute z-10 top-9 left-0 right-0 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                onClick={() => handleSelectPlayer(p)}
              >
                <UserPlus className="w-3 h-3 text-muted-foreground" />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("settings.standingList.empty")}</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const expired = isExpired(entry.expiresAt);
            return (
            <div
              key={entry.id}
              data-testid="standing-wl-entry"
              data-expired={expired}
              className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0"
            >
              {/* Only the text block is de-emphasised — the remove button below keeps full
                  emphasis, since an expired entry is exactly the one a coach wants to delete. */}
              <div className={`flex-1 min-w-0 ${expired ? "opacity-70" : ""}`}>
                <p
                  data-testid="standing-wl-name"
                  className={`text-sm font-medium truncate ${expired ? "text-muted-foreground" : ""}`}
                >
                  {entry.playerName ?? t("settings.standingList.unknown")}
                </p>
                {/* PAD-547 (waiting-list rule 19): a series-scoped entry names its class. */}
                {entry.lessonId ? (
                  <p data-testid="standing-wl-series" className="text-xs text-muted-foreground truncate">
                    {entry.lessonTitle}
                  </p>
                ) : null}
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className="text-xs">
                    {entry.creditsTotal == null
                      ? t("settings.standingList.creditsUnlimited") /* PAD-560 (rule 19): no credit limit */
                      : t("settings.standingList.credits", { used: entry.creditsUsed, total: entry.creditsTotal })}
                  </Badge>
                  {expired && (
                    <Badge
                      variant="secondary"
                      className="text-xs bg-muted text-muted-foreground"
                    >
                      {t("settings.standingList.expired")}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {t("settings.standingList.expires", { date: formatExpiry(entry) })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("settings.standingList.classCount", { count: entry.activeClassCount })}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                data-testid="standing-wl-renew"
                aria-label={t("settings.standingList.renew")}
                className="shrink-0 text-muted-foreground"
                onClick={() => setRenewing(entry)}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                data-testid="standing-wl-remove"
                aria-label={t("settings.standingList.remove")}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemove(entry.id)}
                disabled={removingId === entry.id}
              >
                {removingId === entry.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </Button>
            </div>
            );
          })}
        </div>
      )}

      {selectedPlayer && (
        <AddToStandingWaitingListDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setSelectedPlayer(null); }}
          playerId={selectedPlayer.id}
          playerName={selectedPlayer.name}
          onAdded={handleAdded}
        />
      )}
      {renewing && (
        <AddToStandingWaitingListDialog
          open
          onClose={() => setRenewing(null)}
          playerId={renewing.playerId}
          playerName={renewing.playerName}
          renewing={renewing}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}
