import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import type { Exercise, ExercisePayload, ExerciseGroup, ExerciseGroupPayload } from "@/types/training";
import type { ClassInstance } from "@/types";
import { mockExercises as _mockExercises, mockExerciseGroups as _mockGroups } from "@/data/mockData";

// Mutable local copies so in-memory CRUD works during mock mode
const mockExercises: Exercise[] = [..._mockExercises];
const mockGroups: ExerciseGroup[] = [..._mockGroups];

// ── Exercises ──

export async function getExercises(): Promise<Exercise[]> {
  if (USE_MOCK_DATA) return mockExercises;
  const res = await api.get("/app/exercises");
  return res.data;
}

export async function getExercise(id: string): Promise<Exercise> {
  if (USE_MOCK_DATA) {
    const found = mockExercises.find((e) => e.id === id);
    if (found) return found;
  }
  const res = await api.get(`/app/exercises/${id}`);
  return res.data;
}

export async function createExercise(data: ExercisePayload): Promise<Exercise> {
  if (USE_MOCK_DATA) {
    const ex: Exercise = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockExercises.push(ex);
    return ex;
  }
  const res = await api.post("/app/exercises", data);
  return res.data;
}

export async function updateExercise(id: string, data: ExercisePayload): Promise<Exercise> {
  if (USE_MOCK_DATA) {
    const idx = mockExercises.findIndex((e) => e.id === id);
    if (idx >= 0) {
      mockExercises[idx] = { ...mockExercises[idx], ...data, updatedAt: new Date().toISOString() };
      return mockExercises[idx];
    }
  }
  const res = await api.put(`/app/exercises/${id}`, data);
  return res.data;
}

export async function deleteExercise(id: string): Promise<void> {
  if (USE_MOCK_DATA) {
    const idx = mockExercises.findIndex((e) => e.id === id);
    if (idx >= 0) mockExercises.splice(idx, 1);
    return;
  }
  await api.delete(`/app/exercises/${id}`);
}

// ── Exercise Groups ──

export async function getExerciseGroups(): Promise<ExerciseGroup[]> {
  if (USE_MOCK_DATA) return mockGroups;
  const res = await api.get("/app/exercise-groups");
  return res.data;
}

export async function createExerciseGroup(data: ExerciseGroupPayload): Promise<ExerciseGroup> {
  if (USE_MOCK_DATA) {
    const grp: ExerciseGroup = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockGroups.push(grp);
    return grp;
  }
  const res = await api.post("/app/exercise-groups", data);
  return res.data;
}

export async function updateExerciseGroup(id: string, data: ExerciseGroupPayload): Promise<ExerciseGroup> {
  if (USE_MOCK_DATA) {
    const idx = mockGroups.findIndex((g) => g.id === id);
    if (idx >= 0) {
      mockGroups[idx] = { ...mockGroups[idx], ...data, updatedAt: new Date().toISOString() };
      return mockGroups[idx];
    }
  }
  const res = await api.put(`/app/exercise-groups/${id}`, data);
  return res.data;
}

export async function deleteExerciseGroup(id: string): Promise<void> {
  if (USE_MOCK_DATA) {
    const idx = mockGroups.findIndex((g) => g.id === id);
    if (idx >= 0) mockGroups.splice(idx, 1);
    return;
  }
  await api.delete(`/app/exercise-groups/${id}`);
}

// ── Lesson Instance Training ──

export async function confirmClassTraining(
  classInstance: ClassInstance,
  exerciseIds: string[]
): Promise<{ plannedExerciseIds: string[] }> {
  if (USE_MOCK_DATA) {
    return { plannedExerciseIds: exerciseIds };
  }
  const res = await api.post(`/app/class_instance/training/confirm`, {
    classInstance,
    exerciseIds,
  });
  return res.data;
}
