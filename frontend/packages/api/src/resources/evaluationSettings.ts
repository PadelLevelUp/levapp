import type { EvaluationSettings } from "@levelup/types";
import { getApi } from "../client";

// evaluations.reminders (PAD-404): the coach's evaluation frequency. The GET never creates
// the coach's settings row; a PUT does. The body is sent as given — `everyN: 0` is a 400,
// not "absent", so it is never stripped here.

export async function getEvaluationSettings(): Promise<EvaluationSettings> {
  const res = await getApi().get("/app/evaluation_settings");
  return res.data;
}

export async function putEvaluationSettings(body: EvaluationSettings): Promise<EvaluationSettings> {
  const res = await getApi().put("/app/evaluation_settings", body);
  return res.data;
}
