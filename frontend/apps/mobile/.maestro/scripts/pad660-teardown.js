// PAD-660 (flow 281): clear the nickname the flow gave E2E Student (player 1), so later flows
// see the real name (R-040). Runs whether the flow passed or not.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + json(login.body).accessToken };
var all = json(http.get(api + "/api/app/coach_players", { headers: auth }).body);
var rows = Array.isArray(all) ? all : all.items || [];
for (var i = 0; i < rows.length; i++) {
  if (String(rows[i].playerId) === "1") {
    http.post(api + "/api/app/edit_player", {
      headers: auth,
      body: JSON.stringify({
        player: { coachId: rows[i].coachId, playerId: rows[i].playerId },
        updates: { nickname: "", nicknameAsName: false },
      }),
    });
  }
}
