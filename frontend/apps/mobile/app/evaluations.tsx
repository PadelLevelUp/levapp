import { MyEvaluationsScreen } from "@/features/evaluations/my-evaluations-screen";

/**
 * "As minhas avaliações" (PAD-402, `evaluations.student-view` rule 4): the
 * student dashboard block's "Ver todas" and the `evaluations` capability's
 * push destination both land here.
 */
export default function EvaluationsRoute() {
  return <MyEvaluationsScreen />;
}
