// PAD-920 (flows 320, 321): the class `new-engine-setup.py invite` made, as the coach's API names it.
// Exposes: output.api, output.coachTok, output.auth, output.studentId, output.day, output.instanceId,
// output.detail() (the coach's class payload, read live).
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
output.api = api;
output.coachTok = json(http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
}).body).accessToken;
output.auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
var players = json(http.get(api + "/api/app/coach_players", { headers: output.auth }).body);
players = players.items ? players.items : players;
output.studentId = String(players.filter(function (p) { return p.name === "E2E Student"; })[0].playerId);

function ymd(d) {
  var m = d.getMonth() + 1, x = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" + m : "" + m) + "-" + (x < 10 ? "0" + x : "" + x);
}
var from = ymd(new Date(Date.now() + 2 * 86400000)), to = ymd(new Date(Date.now() + 6 * 86400000));
var found = json(http.get(api + "/api/app/calendar?from=" + from + "T00:00:00&to=" + to + "T23:59:59", { headers: output.auth }).body)
  .filter(function (e) { return e.title === "E2E New Engine iOS" && e.model === "LessonInstance"; })[0];
output.instanceId = found ? found.originalId : null;
output.day = found ? String(found.date).slice(0, 10) : null;
output.detail = function () {
  return json(http.post(api + "/api/app/class_instance?model=LessonInstance&id=" + output.instanceId + "&date=" + output.day, { headers: output.auth, body: "{}" }).body);
};
