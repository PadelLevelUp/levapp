import { api } from "@/api/client";
import type { Exercise, ExercisePayload } from "@/types/training";

export async function getExercises(): Promise<Exercise[]> {
  const res = await api.get("/app/exercises");
  return res.data;
}

export async function getExercise(id: string): Promise<Exercise> {
  const res = await api.get(`/app/exercises/${id}`);
  return res.data;
}

export async function createExercise(data: ExercisePayload): Promise<Exercise> {
  const res = await api.post("/app/exercises", data);
  return res.data;
}

export async function updateExercise(id: string, data: ExercisePayload): Promise<Exercise> {
  const res = await api.put(`/app/exercises/${id}`, data);
  return res.data;
}

export async function deleteExercise(id: string): Promise<void> {
  await api.delete(`/app/exercises/${id}`);
}
