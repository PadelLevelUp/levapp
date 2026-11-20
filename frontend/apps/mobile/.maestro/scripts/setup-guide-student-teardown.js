// PAD-839 (flows 337-340): take the throw-away student off the coach's roster again. Guarded: a
// setup that never got as far as the coach token is a no-op.
if (typeof output.coachTok !== "undefined" && typeof output.name !== "undefined") {
  var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
  var roster = json(http.get(output.api + "/api/app/coach_players", { headers: auth }).body);
  var players = roster.items ? roster.items : roster;
  for (var i = 0; i < players.length; i++) {
    if (players[i].name === output.name) {
      http.post(output.api + "/api/app/remove_player", {
        headers: auth,
        body: JSON.stringify({ playerId: players[i].playerId }),
      });
    }
  }
}
