import type { EvaluationCategory, EvaluationEntryPayload } from "@/types";
import { USE_MOCK_DATA } from "@/config";
import { api } from "@/api/client";

const mockCategories: EvaluationCategory[] = [
  { id: "cat-1", name: "Technique", scaleMin: 0, scaleMax: 100 },
  { id: "cat-2", name: "Tactics", scaleMin: 0, scaleMax: 100 },
  { id: "cat-3", name: "Physical Capacity", scaleMin: 0, scaleMax: 100 },
  { id: "cat-4", name: "Attitude", scaleMin: 0, scaleMax: 100 },
];

export async function getEvaluationCategories(): Promise<EvaluationCategory[]> {
  if (USE_MOCK_DATA) {
    return mockCategories;
  }
  const res = await api.get("/app/evaluation_categories");
  return res.data;
}

export async function postEvaluationEntry(payload: EvaluationEntryPayload): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] postEvaluationEntry", payload);
    return;
  }
  await api.post("/app/evaluation_entry", payload);
}
