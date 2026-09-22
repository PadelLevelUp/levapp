// A coach token for flows that ask the server what a screen did (PAD-388, flow 82).
// Exposes: output.api, output.coachTok. API_BASE is passed by scripts/e2e.sh; the
// default is the shared E2E backend.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
output.api = api;
output.coachTok = json(login.body).accessToken;
