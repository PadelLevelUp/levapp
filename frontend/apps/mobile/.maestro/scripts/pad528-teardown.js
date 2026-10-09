// PAD-528 (flow 189): delete every claimable "E2E Student" placeholder (players.remove rule 5:
// a never-activated placeholder with one coach is deleted), so the seeded roster is as it was
// (R-040) even after an interrupted run. The seeded student herself is not claimable and stays.
if (typeof output.coachTok !== "undefined") {
  var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
  var roster = json(http.get(output.api + "/api/app/coach_players", { headers: auth }).body);
  var rows = roster.items ? roster.items : roster;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].name === "E2E Student" && rows[i].claimable) {
      http.post(output.api + "/api/app/remove_player", {
        headers: auth,
        body: JSON.stringify({ playerId: rows[i].playerId }),
      });
    }
  }
}
