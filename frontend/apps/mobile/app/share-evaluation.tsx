import { useLocalSearchParams } from "expo-router";

import { ShareEvaluationScreen } from "@/features/evaluations/share-evaluation-screen";

/**
 * "Partilhar avaliação" (PAD-402, `evaluations.sharing` rule 14): pushed from
 * the history card's share action, addressed by the record and the player it
 * belongs to — the way `app/class-evaluations.tsx` addresses its occurrence.
 * Both steps of the flow live inside `ShareEvaluationScreen`'s own state.
 */
export default function ShareEvaluationRoute() {
  const { recordId, playerId, playerName } = useLocalSearchParams<{
    recordId: string;
    playerId: string;
    playerName?: string;
  }>();
  return (
    <ShareEvaluationScreen
      recordId={Number(recordId)}
      playerId={String(playerId)}
      playerName={playerName ? String(playerName) : ""}
    />
  );
}
