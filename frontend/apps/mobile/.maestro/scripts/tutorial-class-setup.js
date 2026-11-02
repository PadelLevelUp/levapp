// PAD-816 (flows 43 and 153): the class the "Understand invites" rehearsal previews, created through
// the API (R-040) instead of the seed's "E2E Academy Class". That one is next Monday, so on a Sunday
// it is inside the invitation window and the released scheduler really invites for it until maxTotal
// is used up; the rehearsal then shows no first batch (the same cause as PAD-812 on the web).
// This class is 4 days out: outside the 24 h window (and a few days' more), inside the 7 days a
// standing waiting-list entry fans out to (flow 153). B1, "E2E Student" enrolled, 18:00–19:00.
// Exposes: output.api, output.coachTok, output.tutorialClass (title), output.tutorialDay.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var jh = { "Content-Type": "application/json" };
output.api = api;
output.coachTok = json(http.post(api + "/api/auth/login", {
  headers: jh, body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
}).body).accessToken;
var coach = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };

var levels = json(http.get(api + "/api/app/coach_levels", { headers: coach }).body);
var b1 = null;
for (var i = 0; i < levels.length; i++) { if (levels[i].code === "B1") { b1 = levels[i].id; break; } }
var roster = json(http.get(api + "/api/app/coach_players", { headers: coach }).body);
var players = roster.items ? roster.items : roster;
var student = null;
for (var j = 0; j < players.length; j++) { if (players[j].name === "E2E Student") { student = players[j].playerId; break; } }

var d = new Date(Date.now() + 4 * 86400000);
var mm = d.getMonth() + 1, dd = d.getDate();
output.tutorialDay = d.getFullYear() + "-" + (mm < 10 ? "0" + mm : mm) + "-" + (dd < 10 ? "0" + dd : dd);
output.tutorialClass = "E2E Tutorial Class";
http.post(api + "/api/app/add_class", {
  headers: coach,
  body: JSON.stringify({
    name: output.tutorialClass, classType: "academy", maxPlayers: 4, levelId: b1,
    date: output.tutorialDay, startTime: "18:00", endTime: "19:00",
    playerIds: [String(student)], isRecurring: false,
  }),
});
