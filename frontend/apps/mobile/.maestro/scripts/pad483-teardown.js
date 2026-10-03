// PAD-483 / B-267 (flow 142): undo the block, whatever the flow's outcome (R-040).
if (output.coachTok && output.targetId) {
  http.delete(output.api + "/api/app/users/" + output.targetId + "/block", {
    headers: { Authorization: "Bearer " + output.coachTok },
  });
}
