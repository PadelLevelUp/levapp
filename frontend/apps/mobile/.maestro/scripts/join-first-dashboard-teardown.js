// PAD-444 (flow 113): disconnect e2e-student-3 from the coach again, so the seed's "student with no
// coach" stays true for the flows that rely on it (R-040). Guarded: a setup that never logged in is
// a no-op.
if (typeof output.coachTok !== "undefined") {
  var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
  var roster = json(http.get(output.api + "/api/app/coach_players", { headers: auth }).body);
  var players = roster.items ? roster.items : roster;
  for (var i = 0; i < players.length; i++) {
    if (players[i].name === "E2E Student Three") {
      http.post(output.api + "/api/app/remove_player", {
        headers: auth,
        body: JSON.stringify({ playerId: players[i].playerId }),
      });
    }
  }
}
