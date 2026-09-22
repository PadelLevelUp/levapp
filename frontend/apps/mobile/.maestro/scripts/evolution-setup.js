// PAD-375 (flow 79): what the server says about "E2E Student Two"'s seeded history, so the
// flow can assert that the screen shows exactly that (the client computes nothing — R-048).
// Exposes: output.evoPill, output.evoChart, output.evoM12, output.evoDelta (test ids).
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
var auth = { Authorization: "Bearer " + json(login.body).accessToken };

var roster = json(http.get(api + "/api/app/coach_players", { headers: auth }).body);
var players = roster.items ? roster.items : roster;
var student = null;
for (var i = 0; i < players.length; i++) {
  if (players[i].name === "E2E Student Two") student = players[i];
}
var history = json(http.get(api + "/api/app/player/" + student.playerId + "/evaluations", { headers: auth }).body);
var categoryId = history.competenciesWithData[0];
var evo = json(
  http.get(api + "/api/app/player/" + student.playerId + "/evaluations/evolution?categoryId=" + categoryId, { headers: auth }).body
);

function oneDecimal(value) {
  return value === null ? "—" : value.toFixed(1);
}
var trend = evo.delta === null ? "none" : evo.delta.value > 0 ? "up" : evo.delta.value < 0 ? "down" : "flat";

output.evoPill = "evolution-pill-" + categoryId;
output.evoChart = "evolution-chart-" + evo.scaleMin + "-" + evo.scaleMax + "-" + evo.series.length;
output.evoM12 = "evolution-mean-m12-" + oneDecimal(evo.means.m12);
output.evoM1 = "evolution-mean-m1-" + oneDecimal(evo.means.m1);
output.evoDelta = "evolution-delta-" + trend;
output.evoRecords = history.records.length;
