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
  { value: "attack", label: "Attack" },
  { value: "defense", label: "Defense" },
  { value: "serve", label: "Serve" },
  { value: "return", label: "Return" },
  { value: "volley", label: "Volley" },
  { value: "transition", label: "Transition" },
  { value: "warm_up", label: "Warm-up" },
  { value: "footwork", label: "Footwork" },
  { value: "custom", label: "Custom" },
];

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 1, label: "Beginner" },
  { value: 2, label: "Basic" },
  { value: 3, label: "Intermediate" },
  { value: 4, label: "Advanced" },
  { value: 5, label: "Expert" },
];

export type CourtElementType =
  | "player_1"
  | "player_2"
  | "player_3"
  | "player_4"
  | "coach"
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
  // For players or line labels (e.g. "Lob", "Smash")
  label?: string;
  // Curve offset for arrows/movements (perpendicular px offset for quadratic bezier)
  curve?: number;
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
