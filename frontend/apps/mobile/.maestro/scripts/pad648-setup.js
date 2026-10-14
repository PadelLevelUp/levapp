// PAD-648 (flow 289): every conversation of e2e-coach is read, then e2e-student writes once in
// seeded conversation 1, so it is the coach's only unread thread. `readId` is another of the
// coach's conversations, which "Não lidas" must hide.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
output.api = api;
function tokenFor(username, password) {
  var res = http.post(api + "/api/auth/login", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username, password: password }),
  });
  return json(res.body).accessToken;
}
output.coachTok = tokenFor("e2e-coach", "E2eCoach123!");
output.studentTok = tokenFor("e2e-student", "E2eStudent123!");
var coach = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
var list = json(http.get(api + "/api/app/conversations?limit=50", { headers: coach }).body).conversations;
output.readId = "";
for (var i = 0; i < list.length; i++) {
  var id = String(list[i].id);
  http.post(api + "/api/app/conversation/" + id + "/read", { headers: coach, body: "{}" });
  if (id !== "1" && !output.readId) output.readId = id;
}
var sent = http.post(api + "/api/app/message", {
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + output.studentTok },
  body: JSON.stringify({ conversationId: "1", text: "PAD-648 unread probe", replyToId: null }),
});
output.messageId = json(sent.body).id;
