// B-731 (flow 09): the student posts one tall message into seeded conversation 1 (e2e-coach <->
// e2e-student), so the thread overflows the viewport the open keyboard leaves and the coach's own
// message must be scrolled to. One tall row, not several: a deleted message stays as a one-line
// placeholder, and flows 17 and 19 need "Thanks coach!" on screen afterwards.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
output.api = api;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-student", password: "E2eStudent123!" }),
});
output.studentTok = json(login.body).accessToken;
var lines = [];
for (var i = 1; i <= 14; i++) lines.push("Line " + i);
var res = http.post(api + "/api/app/message", {
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + output.studentTok },
  body: JSON.stringify({ conversationId: "1", text: lines.join("\n"), replyToId: null }),
});
output.postedIds = String(json(res.body).id);
