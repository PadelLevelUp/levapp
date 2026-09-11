import "@/api/client";
import type { EvaluationCategory, EvaluationEntryPayload } from "@/types";
import type { EvaluationCategoryImpact } from "@levelup/types";
import * as evaluationApi from "@levelup/api/src/resources/evaluation";
import { USE_MOCK_DATA } from "@/config";
import { mockEvaluationCategories } from "@/data/mockData";

export async function getEvaluationCategories(): Promise<EvaluationCategory[]> {
  if (USE_MOCK_DATA) {
    return mockEvaluationCategories;
  }
  return evaluationApi.getEvaluationCategories();
}

export async function postEvaluationEntry(payload: EvaluationEntryPayload): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] postEvaluationEntry", payload);
    return;
  }
  await evaluationApi.postEvaluationEntry(payload);
}

export async function addEvaluationCategories(payload: { name: string; scaleMin: number; scaleMax: number }[]): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] addEvaluationCategories", payload);
    return;
  }
  await evaluationApi.addEvaluationCategories(payload);
}

export async function deleteEvaluationCategory(id: string): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] deleteEvaluationCategory", id);
    return;
  }
  await evaluationApi.deleteEvaluationCategory(id);
}

/** evaluations.categories rule 7 (PAD-274): what deleting this category removes. */
export async function getEvaluationCategoryImpact(id: string, name: string): Promise<EvaluationCategoryImpact> {
  if (USE_MOCK_DATA) {
    return { name, scores: 0, players: 0 };
  }
  return evaluationApi.getEvaluationCategoryImpact(id);
}

