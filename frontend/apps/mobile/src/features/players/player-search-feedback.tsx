import { useTranslation } from "react-i18next";
import { playerSearchFeedback } from "@levelup/config";
import { Text } from "@/components/ui/text";

/**
 * players.search rule 10 (PAD-665): the line under a player-name search box. "Searching…" while a
 * server search is in flight, "No player found for «query»" when a settled non-blank query matched
 * nobody, nothing otherwise. Twin of web's components/players/PlayerSearchFeedback.tsx.
 */
export function PlayerSearchFeedback({
  query,
  searching = false,
  count,
  className = "p-2 text-sm text-muted-foreground",
}: {
  query: string;
  searching?: boolean;
  count: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const state = playerSearchFeedback(query, { searching, count });
  if (state === "none") return null;
  if (state === "searching") {
    return (
      <Text className={className} testID="player-search-searching">
        {t("players.search.searching")}
      </Text>
    );
  }
  return (
    <Text className={className} testID="player-search-empty">
      {t("players.search.noResults", { query: query.trim() })}
    </Text>
  );
}
