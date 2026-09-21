import { useLocalSearchParams } from "expo-router";

import { PlayerEvaluationsScreen } from "@/features/evaluations/player-evaluations-screen";

/** "Avaliações — {nome}" (PAD-374): pushed from the player profile with the player's id and name. */
export default function PlayerEvaluationsRoute() {
  const { playerId, name } = useLocalSearchParams<{ playerId: string; name?: string }>();
  return <PlayerEvaluationsScreen playerId={String(playerId)} playerName={name ?? ""} />;
}
