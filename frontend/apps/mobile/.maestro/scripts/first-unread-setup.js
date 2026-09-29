// PAD-415 (flow 114): the coach reads seeded conversation 1 (e2e-coach <-> e2e-student),
// then the student posts 40 messages. The first of them is the coach's first unread and
// sits behind the first page of 30, so the open must walk back to it.
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
http.post(api + "/api/app/conversation/1/read", {
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok },
  body: "{}",
});
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.studentTok };
var ids = [];
for (var i = 1; i <= 40; i++) {
  var res = http.post(api + "/api/app/message", {
    headers: auth,
    body: JSON.stringify({ conversationId: "1", text: "PAD-415 probe " + i, replyToId: null }),
  });
  ids.push(json(res.body).id);
}
output.postedIds = ids.join(",");
output.firstUnreadId = ids[0];
output.newestId = ids[ids.length - 1];
