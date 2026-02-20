import type { EvaluationCategory, EvaluationEntryPayload } from "@/types";
import { USE_MOCK_DATA } from "@/config";
import { api } from "@/api/client";
import { mockEvaluationCategories } from "@/data/mockData";

export async function getEvaluationCategories(): Promise<EvaluationCategory[]> {
  if (USE_MOCK_DATA) {
    return mockEvaluationCategories;
  }
  const res = await api.get("/app/evaluation_categories");
  return res.data;
}

export async function postEvaluationEntry(payload: EvaluationEntryPayload): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] postEvaluationEntry", payload);
    return;
  }
  await api.post("/app/add_evaluation_entry", payload);
}

export async function addEvaluationCategories(payload: { name: string; scaleMin: number; scaleMax: number }[]): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] addEvaluationCategories", payload);
    return;
  }
  await api.post("/app/add_evaluation_categories", payload);
}

export async function deleteEvaluationCategory(id: string): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] deleteEvaluationCategory", id);
    return;
  }
  await api.post("/delete/evaluation_category", { ids: [id] });
}
