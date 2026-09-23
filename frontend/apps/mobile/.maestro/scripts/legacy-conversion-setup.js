// PAD-403 (flow 98): a known starting point for the legacy-conversion journey, through the API.
// Mirrors apps/web/e2e/evaluation-tools/legacy-conversion.spec.ts's own setup.
//   - logs in as the seeded coach
//   - creates a fresh legacy category the way an old client would — posted as a 0-10 scale —
//     so the flow can prove the server stores and echoes it 1-5 regardless (PAD-403's contract)
//   - deletes every evaluation record of "E2E Student", so the flow starts on the empty state
// Exposes: output.api, output.coachTok, output.evalPlayerId, output.categoryId,
//          output.categoryScaleMin, output.categoryScaleMax
// API_BASE is passed by scripts/e2e.sh; the default is the shared E2E backend.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var jsonHeaders = { "Content-Type": "application/json" };

var login = http.post(api + "/api/auth/login", {
  headers: jsonHeaders,
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
var token = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + token };

// "Maestro " prefix: competency-manager-setup.js's own convention for a category a dead run
// can leave behind — this flow's teardown deletes it by id, but a stray one from a run that
// died half-way would otherwise answer 409 duplicate_name forever.
var name = "Maestro Legacy Conversion " + Date.now();
http.post(api + "/api/app/add_evaluation_categories", {
  headers: auth,
  body: JSON.stringify([{ name: name, scaleMin: 0, scaleMax: 10 }]),
});

var categories = json(http.get(api + "/api/app/evaluation_categories", { headers: auth }).body);
var category = null;
for (var i = 0; i < categories.length; i++) {
  if (categories[i].name === name) category = categories[i];
}

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
output.categoryId = String(category.id);
output.categoryScaleMin = category.scaleMin;
output.categoryScaleMax = category.scaleMax;
