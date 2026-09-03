---
id: training.court-diagram
status: implemented
depends_on: [training.exercises]
implements: ../../specs-business/training/coach-relies-on-training.business.md
governed_by: []
---

# training.court-diagram


### Intent
Visual court diagram editor for exercises, allowing coaches to place players, cones, balls, and movement arrows on a padel court.

### Rules
1. Frontend-only interactive editor (CourtDiagram component)
2. Elements are draggable on a court canvas
3. Element types: player_1-4, coach, cone, blocker, ball, arrow, movement
4. Each element: id, type, x, y, endX, endY (for arrows), label, curve, rotation
5. Serialized as JSON and stored in Exercise.diagram
