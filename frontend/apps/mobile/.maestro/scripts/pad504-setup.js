// PAD-504 (flow 144): a full academy class four days out (one spot, taken by a filler), the
// coach's open-spots toggle on, and e2e-student on its waiting list — all through the API (R-040).
// Exposes: output.api, output.coachTok, output.student, output.instanceId, output.day,
//          output.title, output.wasVisible (read by the teardown).
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var jh = { "Content-Type": "application/json" };
function tokenFor(u, p) {
  return json(http.post(api + "/api/auth/login", { headers: jh, body: JSON.stringify({ username: u, password: p }) }).body).accessToken;
}
output.api = api;
output.title = "E2E PAD-504 Full Class";
output.coachTok = tokenFor("e2e-coach", "E2eCoach123!");
output.student = tokenFor("e2e-student", "E2eStudent123!");
var coach = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
var student = { "Content-Type": "application/json", Authorization: "Bearer " + output.student };
output.wasVisible = !!json(http.get(api + "/api/app/notify/config", { headers: coach }).body).openSpotsVisible;
http.post(api + "/api/app/notify/config", { headers: coach, body: JSON.stringify({ openSpotsVisible: true }) });
var d = new Date(); d.setDate(d.getDate() + 4);
var m = d.getMonth() + 1, dd = d.getDate();
output.day = d.getFullYear() + "-" + (m < 10 ? "0" + m : "" + m) + "-" + (dd < 10 ? "0" + dd : "" + dd);
var roster = json(http.get(api + "/api/app/coach_players", { headers: coach }).body);
var players = roster.items ? roster.items : roster;
var filler = null;
for (var i = 0; i < players.length; i++) { if (players[i].name.indexOf("Filler Player") === 0) { filler = players[i]; break; } }
http.post(api + "/api/app/add_class", {
  headers: coach,
  body: JSON.stringify({
    name: output.title, date: output.day, maxPlayers: 1, playerIds: [filler.playerId], classType: "academy",
    startTime: "18:00", endTime: "19:00", isRecurring: false, notificationsEnabled: false,
  }),
});
var coachId = json(http.get(api + "/api/app/class-requests/coaches", { headers: student }).body)[0].id;
var classes = json(http.get(api + "/api/app/academy-classes?coachId=" + coachId, { headers: student }).body).classes || [];
var full = null;
for (var c = 0; c < classes.length; c++) { if (classes[c].title === output.title) { full = classes[c]; break; } }
var joined = json(http.post(api + "/api/app/class-waiting-list", {
  headers: student,
  body: JSON.stringify({ model: full.model, originalId: full.originalId, date: full.date }),
}).body);
output.instanceId = joined.lessonInstanceId;
