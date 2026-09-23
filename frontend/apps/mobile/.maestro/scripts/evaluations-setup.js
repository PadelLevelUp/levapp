// PAD-374 (flow 78): a clean slate for the player's evaluations, through the API.
//   - logs in as the seeded coach
//   - switches ON the catalogue competency "technique" (idempotent POST), so the form
//     has a STAR row next to the seeded legacy "Forehand" (stars too since PAD-403)
//   - deletes every evaluation record of "E2E Student", so the flow starts on the empty state
// Exposes: output.api, output.coachTok, output.evalPlayerId, output.techniqueId
// API_BASE is passed by scripts/e2e.sh; the default is the shared E2E backend.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var jsonHeaders = { "Content-Type": "application/json" };

var login = http.post(api + "/api/auth/login", {
  headers: jsonHeaders,
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
var token = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + token };

var technique = json(
  http.post(api + "/api/app/evaluation_competency", { headers: auth, body: JSON.stringify({ catalogueKey: "technique" }) }).body
);

var roster = json(http.get(api + "/api/app/coach_players", { headers: auth }).body);
var players = roster.items ? roster.items : roster;
var student = null;
for (var i = 0; i < players.length; i++) {
  if (players[i].name === "E2E Student") student = players[i];
}

var history = json(http.get(api + "/api/app/player/" + student.playerId + "/evaluations", { headers: auth }).body);
for (var r = 0; r < history.records.length; r++) {
  // Maestro's http.delete takes no body; the route needs none.
  http.delete(api + "/api/app/evaluation_record/" + history.records[r].id, { headers: auth });
}

output.api = api;
output.coachTok = token;
output.evalPlayerId = String(student.playerId);
output.techniqueId = String(technique.id);
