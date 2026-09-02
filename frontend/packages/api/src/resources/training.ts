import type { Exercise, ExercisePayload, ExerciseGroup, ExerciseGroupPayload, ClassInstance } from "@levelup/types";
import { getApi } from "../client";

// ── Exercises ──

export async function getExercises(): Promise<Exercise[]> {
  const res = await getApi().get("/app/exercises");
  return res.data;
}

export async function getExercise(id: string): Promise<Exercise> {
  const res = await getApi().get(`/app/exercises/${id}`);
  return res.data;
}

export async function createExercise(data: ExercisePayload): Promise<Exercise> {
  const res = await getApi().post("/app/exercises", data);
  return res.data;
}

export async function updateExercise(id: string, data: ExercisePayload): Promise<Exercise> {
  const res = await getApi().put(`/app/exercises/${id}`, data);
  return res.data;
}

export async function deleteExercise(id: string): Promise<void> {
  await getApi().delete(`/app/exercises/${id}`);
}

// ── Exercise Groups ──

export async function getExerciseGroups(): Promise<ExerciseGroup[]> {
  const res = await getApi().get("/app/exercise-groups");
  return res.data;
}

export async function createExerciseGroup(data: ExerciseGroupPayload): Promise<ExerciseGroup> {
  const res = await getApi().post("/app/exercise-groups", data);
  return res.data;
}

export async function updateExerciseGroup(id: string, data: ExerciseGroupPayload): Promise<ExerciseGroup> {
  const res = await getApi().put(`/app/exercise-groups/${id}`, data);
  return res.data;
}

export async function deleteExerciseGroup(id: string): Promise<void> {
  await getApi().delete(`/app/exercise-groups/${id}`);
}

// ── Lesson Instance Training ──

export async function confirmClassTraining(
  classInstance: ClassInstance,
  exerciseIds: string[]
): Promise<{ plannedExerciseIds: string[] }> {
  const res = await getApi().post(`/app/class_instance/training/confirm`, {
    classInstance,
    exerciseIds,
  });
  return res.data;
}
