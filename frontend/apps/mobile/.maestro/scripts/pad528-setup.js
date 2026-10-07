// PAD-528 (flow 189): as the seeded coach, create a claimable placeholder with the seeded
// student's exact name, so the roster flags it as a possible duplicate of e2e-student
// (players.claim rule 4c). The create route answers only the invite token, so the id is
// read back from the roster: the newest claimable row with that name.
// Exposes: output.api, output.coachTok, output.placeholderId.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
output.api = api;
output.coachTok = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
var me = json(http.get(api + "/api/auth/me", { headers: auth }).body);
http.post(api + "/api/app/incomplete_player", {
  headers: auth,
  body: JSON.stringify({ coachId: me.coachId, name: "E2E Student", side: "left" }),
});
var roster = json(http.get(api + "/api/app/coach_players", { headers: auth }).body);
var rows = roster.items ? roster.items : roster;
var best = null;
for (var i = 0; i < rows.length; i++) {
  if (rows[i].name === "E2E Student" && rows[i].claimable && (best === null || Number(rows[i].playerId) > best)) {
    best = Number(rows[i].playerId);
  }
}
output.placeholderId = best;
