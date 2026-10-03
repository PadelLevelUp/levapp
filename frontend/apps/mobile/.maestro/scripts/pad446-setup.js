// PAD-446 (flow 153): put one roster student who is not in "E2E Academy Class" on the coach's
// standing waiting list, through the API (R-040). The entry fans out to the coach's upcoming
// classes, that one included, so the "Understand invites" rehearsal shows them as asked first.
// Exposes: output.api, output.coachTok, output.playerId, output.entryId (read by the teardown).
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var jh = { "Content-Type": "application/json" };
output.api = api;
output.coachTok = json(http.post(api + "/api/auth/login", {
  headers: jh, body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
}).body).accessToken;
var coach = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
var roster = json(http.get(api + "/api/app/coach_players", { headers: coach }).body);
var players = roster.items ? roster.items : roster;
for (var i = 0; i < players.length; i++) {
  if (players[i].name === "Filler Player 01") { output.playerId = players[i].playerId; break; }
}
var added = json(http.post(api + "/api/app/notify/standing_waiting_list", {
  headers: coach, body: JSON.stringify({ playerId: output.playerId, credits: 1, durationDays: 7 }),
}).body);
output.entryId = added.id;
