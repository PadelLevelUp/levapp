import { useTranslation } from "react-i18next";
import { playerSearchFeedback } from "@levelup/config";

/**
 * players.search rule 10 (PAD-665): the line under a player-name search box. "Searching…" while a
 * server search is in flight, "No player found for «query»" when a settled non-blank query matched
 * nobody, nothing otherwise. Twin of iOS's features/players/player-search-feedback.tsx.
 */
export function PlayerSearchFeedback({
  query,
  searching = false,
  count,
  className = "p-2 text-sm text-muted-foreground",
  as: Tag = "p",
}: {
  query: string;
  searching?: boolean;
  count: number;
  className?: string;
  /** The element to render, for a list parent that needs `li`. */
  as?: "p" | "li";
}) {
  const { t } = useTranslation();
  const state = playerSearchFeedback(query, { searching, count });
  if (state === "none") return null;
  if (state === "searching") {
    return (
      <Tag className={className} data-testid="player-search-searching" role="status">
        {t("players.search.searching")}
      </Tag>
    );
  }
  return (
    <Tag className={className} data-testid="player-search-empty">
      {t("players.search.noResults", { query: query.trim() })}
    </Tag>
  );
}
