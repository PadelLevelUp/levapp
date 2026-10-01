// PAD-475 (flow 122): the student logs in so the flow can post ONE message into seeded
// conversation 1 (e2e-coach <-> e2e-student) while the coach's app is in the background.
// Nothing is posted here: the message must arrive after the app has left the foreground.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
output.api = api;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-student", password: "E2eStudent123!" }),
});
output.studentTok = json(login.body).accessToken;
output.postedIds = "";
