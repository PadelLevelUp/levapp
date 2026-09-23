// PAD-408 (flow 103): the student posts 45 messages into seeded conversation 1
// (e2e-coach <-> e2e-student). The 3rd is the TARGET: older than the thread's
// first page of 30, so the thread must load an older page to reach it. The
// newest is remembered so the flow can prove it did NOT land at the bottom.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
output.api = api;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-student", password: "E2eStudent123!" }),
});
output.studentTok = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.studentTok };
var ids = [];
for (var i = 1; i <= 45; i++) {
  var res = http.post(api + "/api/app/message", {
    headers: auth,
    body: JSON.stringify({ conversationId: "1", text: "PAD-408 probe " + i, replyToId: null }),
  });
  ids.push(json(res.body).id);
}
output.postedIds = ids.join(",");
output.targetId = ids[2];
output.newestId = ids[ids.length - 1];
