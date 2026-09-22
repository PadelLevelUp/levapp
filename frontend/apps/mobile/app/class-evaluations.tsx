import { useLocalSearchParams } from "expo-router";

import { ClassEvaluationsScreen } from "@/features/evaluations/class-evaluations-screen";

/**
 * "Avaliações — {aula}" (PAD-376): pushed from the class detail with the occurrence's
 * own addressing (`model` / `id` / `date`, as `POST /class_instance` takes it) and its name.
 */
export default function ClassEvaluationsRoute() {
  const { model, id, date, name } = useLocalSearchParams<{ model: string; id: string; date?: string; name?: string }>();
  return (
    <ClassEvaluationsScreen
      classRef={{ model: String(model), id: Number(id), date: date ? String(date) : null }}
      className={name ?? ""}
    />
  );
}
