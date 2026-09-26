import type { EvaluationScale } from "@levelup/types";
import { getApi } from "../client";

// evaluations.scale (PAD-423): the coach's evaluation scale, a sibling of evaluation_settings
// (PAD-404's `{reminder, everyN}` is unchanged). The GET never creates the coach's settings row.

export async function getEvaluationScale(): Promise<EvaluationScale> {
  const res = await getApi().get("/app/evaluation_scale");
  return res.data;
}

export async function putEvaluationScale(body: EvaluationScale): Promise<EvaluationScale> {
  const res = await getApi().put("/app/evaluation_scale", body);
  return res.data;
}
