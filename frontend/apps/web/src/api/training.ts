import "@/api/client";
import * as trainingApi from "@levelup/api/src/resources/training";
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
  return trainingApi.getExercises();
}

export async function getExercise(id: string): Promise<Exercise> {
  if (USE_MOCK_DATA) {
    const found = mockExercises.find((e) => e.id === id);
    if (found) return found;
  }
  return trainingApi.getExercise(id);
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
  return trainingApi.createExercise(data);
}

export async function updateExercise(id: string, data: ExercisePayload): Promise<Exercise> {
  if (USE_MOCK_DATA) {
    const idx = mockExercises.findIndex((e) => e.id === id);
    if (idx >= 0) {
      mockExercises[idx] = { ...mockExercises[idx], ...data, updatedAt: new Date().toISOString() };
      return mockExercises[idx];
    }
  }
  return trainingApi.updateExercise(id, data);
}

export async function deleteExercise(id: string): Promise<void> {
  if (USE_MOCK_DATA) {
    const idx = mockExercises.findIndex((e) => e.id === id);
    if (idx >= 0) mockExercises.splice(idx, 1);
    return;
  }
  await trainingApi.deleteExercise(id);
}

// ── Exercise Groups ──

export async function getExerciseGroups(): Promise<ExerciseGroup[]> {
  if (USE_MOCK_DATA) return mockGroups;
  return trainingApi.getExerciseGroups();
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
  return trainingApi.createExerciseGroup(data);
}

export async function updateExerciseGroup(id: string, data: ExerciseGroupPayload): Promise<ExerciseGroup> {
  if (USE_MOCK_DATA) {
    const idx = mockGroups.findIndex((g) => g.id === id);
    if (idx >= 0) {
      mockGroups[idx] = { ...mockGroups[idx], ...data, updatedAt: new Date().toISOString() };
      return mockGroups[idx];
    }
  }
  return trainingApi.updateExerciseGroup(id, data);
}

export async function deleteExerciseGroup(id: string): Promise<void> {
  if (USE_MOCK_DATA) {
    const idx = mockGroups.findIndex((g) => g.id === id);
    if (idx >= 0) mockGroups.splice(idx, 1);
    return;
  }
  await trainingApi.deleteExerciseGroup(id);
}

// ── Lesson Instance Training ──

export async function confirmClassTraining(
  classInstance: ClassInstance,
  exerciseIds: string[]
): Promise<{ plannedExerciseIds: string[] }> {
  if (USE_MOCK_DATA) {
    return { plannedExerciseIds: exerciseIds };
  }
  return trainingApi.confirmClassTraining(classInstance, exerciseIds);
}
