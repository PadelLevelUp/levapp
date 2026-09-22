// PAD-376 (flow 80): a class of the coach's own for TODAY with "E2E Student" enrolled, through the
// API, and a clean slate for that student's evaluations. The flow rates from the class and asserts
// on the server; scripts/class-evaluations-teardown.js removes what this made.
// Exposes: output.api, output.coachTok, output.evalPlayerId, output.techniqueId, output.classTitle, output.classEvent
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var jsonHeaders = { "Content-Type": "application/json" };

var login = http.post(api + "/api/auth/login", {
  headers: jsonHeaders,
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
var token = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + token };

// The seeded coach owns ONE competency, the legacy "Forehand" (a stepper). A STAR row needs a
// catalogue competency switched on: "technique" (idempotent POST); the teardown switches it off.
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
  http.delete(api + "/api/app/evaluation_record/" + history.records[r].id, { headers: auth });
}

var now = new Date();
var today = now.getFullYear() + "-" + ("0" + (now.getMonth() + 1)).slice(-2) + "-" + ("0" + now.getDate()).slice(-2);
var title = "E2E Eval Class";
var made = json(
  http.post(api + "/api/app/add_class", {
    headers: auth,
    body: JSON.stringify({
      name: title, classType: "academy", maxPlayers: 4, date: today, startTime: "20:30", endTime: "21:30",
      isRecurring: false, playerIds: [student.playerId],
    }),
  }).body
);

output.api = api;
output.coachTok = token;
output.evalPlayerId = String(student.playerId);
output.techniqueId = String(technique.id);
output.classTitle = title;
output.classEvent = made;
