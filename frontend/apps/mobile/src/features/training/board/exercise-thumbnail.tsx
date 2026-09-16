import { VIEW_H, VIEW_W, upgradeCourtDiagram } from "@levelup/config";
import type { Exercise } from "@levelup/types";
import * as React from "react";
import { View } from "react-native";
import { CourtSurface } from "./court-surface";

const NAVY = "#0D1B31";
const HEIGHT = 96;

/** Legacy diagrams count when they have elements; v2 ones when they have any piece or step. */
export function hasDiagram(exercise: Exercise): boolean {
  const d = exercise.diagram;
  if (!d) return false;
  if ("version" in d) return d.pieces.length > 0 || d.steps.length > 0;
  return d.elements.length > 0;
}

/**
 * The exercise-card thumbnail — the same renderer as the board, in compact
 * mode, showing the starting position and the first step's ball path
 * (training.tactical-board rule 13). Mirrors web's ExerciseCard thumbnail.
 */
export function ExerciseThumbnail({ exercise }: { exercise: Exercise }) {
  if (!hasDiagram(exercise)) return null;
  const width = (HEIGHT * VIEW_W) / VIEW_H;
  return (
    <View testID={`exercise-thumbnail-${exercise.id}`} className="items-center rounded-md p-1.5" style={{ backgroundColor: NAVY }}>
      <CourtSurface compact diagram={upgradeCourtDiagram(exercise.diagram)} width={width} height={HEIGHT} testID={`court-thumbnail-${exercise.id}`} />
    </View>
  );
}
