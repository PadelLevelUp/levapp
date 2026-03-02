import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import type { Exercise, ExercisePayload } from "@/types/training";

const mockExercises: Exercise[] = [
  {
    id: "ex-mock-1",
    name: "Cross-court Lob Recovery",
    description:
      "Player 1 at the net plays a volley, opponent responds with a cross-court lob. Player 2 recovers behind and plays a bandeja. Focus on positioning and communication.",
    type: "defense",
    difficulty: 3,
    levelIds: [],
    notes: "Emphasize split-step timing and early ball tracking. Rotate players after 5 reps.",
    diagram: {
      elements: [
        { id: "m1-p1", type: "player_1", x: 80, y: 210, label: "P1" },
        { id: "m1-p2", type: "player_2", x: 180, y: 210, label: "P2" },
        { id: "m1-p3", type: "player_3", x: 90, y: 330, label: "P3" },
        { id: "m1-p4", type: "player_4", x: 170, y: 330, label: "P4" },
        { id: "m1-coach", type: "coach", x: 40, y: 270 },
        { id: "m1-ball", type: "ball", x: 80, y: 230 },
        { id: "m1-a1", type: "arrow", x: 90, y: 330, endX: 160, endY: 200, label: "Lob", curve: -35 },
        { id: "m1-a2", type: "movement", x: 180, y: 210, endX: 180, endY: 130, label: "Recovery", curve: 20 },
        { id: "m1-a3", type: "arrow", x: 180, y: 130, endX: 90, endY: 350, label: "Bandeja", curve: 25 },
        { id: "m1-c1", type: "cone", x: 120, y: 180 },
        { id: "m1-c2", type: "cone", x: 140, y: 180 },
      ],
    },
    createdAt: "2025-12-15T10:00:00Z",
    updatedAt: "2025-12-15T10:00:00Z",
  },
  {
    id: "ex-mock-2",
    name: "Serve & Volley Drill",
    description:
      "Practice the serve and immediate net approach. Server hits wide, follows the ball to the net, and finishes with a volley.",
    type: "serve",
    difficulty: 2,
    levelIds: [],
    diagram: {
      elements: [
        { id: "m2-p1", type: "player_1", x: 80, y: 460, label: "P1" },
        { id: "m2-p3", type: "player_3", x: 170, y: 100, label: "P3" },
        { id: "m2-a1", type: "arrow", x: 80, y: 460, endX: 170, endY: 120, label: "Serve", curve: 15 },
        { id: "m2-a2", type: "movement", x: 80, y: 460, endX: 90, endY: 280, label: "Approach", curve: -20 },
        { id: "m2-a3", type: "arrow", x: 90, y: 280, endX: 160, endY: 350, label: "Volley", curve: 0 },
      ],
    },
    createdAt: "2025-12-10T08:30:00Z",
    updatedAt: "2025-12-10T08:30:00Z",
  },
];

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
