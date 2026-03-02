export type ExerciseType =
  | "attack"
  | "defense"
  | "serve"
  | "return"
  | "volley"
  | "transition"
  | "warm_up"
  | "footwork"
  | "custom";

export const EXERCISE_TYPE_OPTIONS: { value: ExerciseType; label: string }[] = [
  { value: "attack", label: "Ataque" },
  { value: "defense", label: "Defensa" },
  { value: "serve", label: "Saque" },
  { value: "return", label: "Resto" },
  { value: "volley", label: "Volea" },
  { value: "transition", label: "Transición" },
  { value: "warm_up", label: "Calentamiento" },
  { value: "footwork", label: "Juego de pies" },
  { value: "custom", label: "Personalizado" },
];

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 1, label: "Principiante" },
  { value: 2, label: "Básico" },
  { value: 3, label: "Intermedio" },
  { value: 4, label: "Avanzado" },
  { value: 5, label: "Experto" },
];

export type CourtElementType =
  | "player_a"
  | "player_b"
  | "cone"
  | "blocker"
  | "ball"
  | "arrow"
  | "movement";

export interface CourtElement {
  id: string;
  type: CourtElementType;
  x: number;
  y: number;
  // For arrows / movement lines
  endX?: number;
  endY?: number;
  // For players
  label?: string;
  // Rotation in degrees
  rotation?: number;
}

export interface CourtDiagram {
  elements: CourtElement[];
}

export interface Exercise {
  id: string;
  name: string;
  description?: string;
  type: ExerciseType;
  customType?: string;
  difficulty: Difficulty;
  levelIds: string[];
  diagram?: CourtDiagram;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExercisePayload {
  name: string;
  description?: string;
  type: ExerciseType;
  customType?: string;
  difficulty: Difficulty;
  levelIds: string[];
  diagram?: CourtDiagram;
  notes?: string;
}
