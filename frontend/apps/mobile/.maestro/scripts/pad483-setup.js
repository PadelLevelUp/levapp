// PAD-483 / B-267 (flow 142): pick a student on e2e-coach's picker who has no thread with
// the coach yet, so tapping their row POSTs a new conversation (an existing thread would
// just open). The block that makes the server refuse comes later, in pad483-block.js,
// after the screen has loaded its list.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
output.api = api;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
output.coachTok = json(login.body).accessToken;
var auth = { Authorization: "Bearer " + output.coachTok };
var people = json(http.get(api + "/api/app/messageable-users", { headers: auth }).body);
var page = json(http.get(api + "/api/app/conversations?page=1&limit=50", { headers: auth }).body);
var taken = {};
(page.conversations || []).forEach(function (c) { taken[String(c.participantId)] = true; });
output.targetId = 0;
for (var i = 0; i < people.length; i++) {
  if (!taken[String(people[i].id)]) { output.targetId = people[i].id; break; }
}
