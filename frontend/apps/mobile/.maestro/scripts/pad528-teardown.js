// PAD-528 (flow 189): delete the placeholder the setup created (players.remove rule 5: a
// never-activated placeholder with one coach is deleted), so the seeded roster is as it was
// (R-040). Guarded: a setup that never created one is a no-op.
if (typeof output.coachTok !== "undefined" && typeof output.placeholderId !== "undefined" && output.placeholderId) {
  http.post(output.api + "/api/app/remove_player", {
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok },
    body: JSON.stringify({ playerId: output.placeholderId }),
  });
}
