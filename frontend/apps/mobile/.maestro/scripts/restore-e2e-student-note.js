// PAD-388 (flow 82, onFlowComplete): put E2E Student's SEEDED note back, whether the
// flow passed or failed, so the next flow (07-player-notes) reads the seed it expects.
// Logs in itself: onFlowComplete cannot rely on the flow's output having been set.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + json(login.body).accessToken };
var roster = json(http.get(api + "/api/app/coach_players", { headers: auth }).body);
var players = roster.items ? roster.items : roster;
for (var i = 0; i < players.length; i++) {
  if (players[i].name === "E2E Student" && players[i].notes !== "E2E test player") {
    // The route pins coachId to the JWT; the snapshot is the row as served, so the
    // diff sees exactly one change.
    http.post(api + "/api/app/edit_player", {
      headers: auth,
      body: JSON.stringify({ player: players[i], updates: { notes: "E2E test player" } }),
    });
  }
}
