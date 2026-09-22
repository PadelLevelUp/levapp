import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { PlayerEvaluationsScreen } from "@/features/evaluations/player-evaluations-screen";

/** "Avaliações — {nome}" (PAD-374): pushed from the player profile with the player's id and name. */
export default function PlayerEvaluationsRoute() {
  const { playerId, name } = useLocalSearchParams<{ playerId: string; name?: string }>();
  const { t } = useTranslation();
  // Without a name param the title still reads as a title, not "Avaliações — ".
  return <PlayerEvaluationsScreen playerId={String(playerId)} playerName={name || t("players.evaluationHistory.player")} />;
}
