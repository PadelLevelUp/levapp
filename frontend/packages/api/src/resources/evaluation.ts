import type { EvaluationCategory, EvaluationEntryPayload } from "@levelup/types";
import { getApi } from "../client";

export async function getEvaluationCategories(): Promise<EvaluationCategory[]> {
  const res = await getApi().get("/app/evaluation_categories");
  return res.data;
}

export async function postEvaluationEntry(payload: EvaluationEntryPayload): Promise<void> {
  await getApi().post("/app/add_evaluation_entry", payload);
}

export async function addEvaluationCategories(payload: { name: string; scaleMin: number; scaleMax: number }[]): Promise<void> {
  await getApi().post("/app/add_evaluation_categories", payload);
}

export async function deleteEvaluationCategory(id: string): Promise<void> {
  await getApi().post("/app/delete/evaluation_category", { id: id });
}
