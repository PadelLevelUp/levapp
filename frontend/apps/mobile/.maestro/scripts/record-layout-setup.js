// PAD-438 / B-223 (flow 116): the coach token, the E2E Student's player id, the day two days out
// the flow's class goes on, and no leftover "Maestro PAD-438" class in the next week (R-040).
// Exposes: output.api, output.coachTok, output.pid, output.day, output.rangeFrom, output.rangeTo.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
output.api = api;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
output.coachTok = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };

var roster = json(http.get(api + "/api/app/coach_players", { headers: auth }).body);
var players = roster.items ? roster.items : roster;
for (var i = 0; i < players.length; i++) {
  if (players[i].name === "E2E Student") output.pid = players[i].playerId;
}

function localIso(d) {
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}
var now = new Date();
output.day = localIso(new Date(now.getTime() + 2 * 86400000));
output.rangeFrom = localIso(now);
output.rangeTo = localIso(new Date(now.getTime() + 8 * 86400000));

var events = json(http.get(api + "/api/app/calendar?from=" + output.rangeFrom + "T00:00:00&to=" + output.rangeTo + "T23:59:59", { headers: auth }).body);
for (var j = 0; j < events.length; j++) {
  if (events[j].type === "class" && String(events[j].title).indexOf("Maestro PAD-438") === 0) {
    http.post(api + "/api/app/remove_class", { headers: auth, body: JSON.stringify({ event: events[j], scope: "single" }) });
  }
}
