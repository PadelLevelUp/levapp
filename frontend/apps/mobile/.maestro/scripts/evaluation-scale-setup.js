// PAD-423 (flows 119, 120): a known starting point for the evaluation-scale journeys, through the API.
//   - logs in as the seeded coach and puts the coach on the 1-5 scale (whatever a dead run left)
//   - creates a fresh CUSTOM competency ("Maestro " prefix, competency-manager-setup.js's
//     convention for a row a dead run can leave behind), on the coach's scale: 1-5 here
//   - deletes every evaluation record of "E2E Student", so the flow starts on the empty state
// Exposes: output.api, output.coachTok, output.evalPlayerId, output.competencyId
// API_BASE is passed by scripts/e2e.sh; the default is the shared E2E backend.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var jsonHeaders = { "Content-Type": "application/json" };

var login = http.post(api + "/api/auth/login", {
  headers: jsonHeaders,
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
var token = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + token };

http.put(api + "/api/app/evaluation_scale", { headers: auth, body: JSON.stringify({ scaleMax: 5 }) });

var created = json(http.post(api + "/api/app/evaluation_competency", {
  headers: auth,
  body: JSON.stringify({ name: "Maestro Scale A " + Date.now() }),
}).body);

var roster = json(http.get(api + "/api/app/coach_players", { headers: auth }).body);
var players = roster.items ? roster.items : roster;
var student = null;
for (var j = 0; j < players.length; j++) {
  if (players[j].name === "E2E Student") student = players[j];
}

var history = json(http.get(api + "/api/app/player/" + student.playerId + "/evaluations", { headers: auth }).body);
for (var r = 0; r < history.records.length; r++) {
  // Maestro's http.delete takes no body; the route needs none.
  http.delete(api + "/api/app/evaluation_record/" + history.records[r].id, { headers: auth });
}

output.api = api;
output.coachTok = token;
output.evalPlayerId = String(student.playerId);
output.competencyId = String(created.id);
