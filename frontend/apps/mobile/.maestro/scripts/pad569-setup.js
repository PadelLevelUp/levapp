// PAD-569 (flow 240): the student posts 40 messages into seeded conversation 1
// (e2e-coach <-> e2e-student) so the thread is taller than the screen; the newest id is
// remembered so the flow can assert it stays visible above the keyboard. Teardown deletes
// them (R-040).
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
output.api = api;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-student", password: "E2eStudent123!" }),
});
output.studentTok = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.studentTok };
var ids = [];
for (var i = 1; i <= 40; i++) {
  var res = http.post(api + "/api/app/message", {
    headers: auth,
    body: JSON.stringify({ conversationId: "1", text: "PAD-569 filler " + i, replyToId: null }),
  });
  ids.push(json(res.body).id);
}
output.postedIds = ids.join(",");
output.newestId = ids[ids.length - 1];
// The seed leaves the student an unread automatic message, and rule 9a would open the thread
// on it (PAD-415) rather than at the bottom. The flow is about the bottom, so mark it read.
http.post(api + "/api/app/conversation/1/read", { headers: auth, body: "{}" });
