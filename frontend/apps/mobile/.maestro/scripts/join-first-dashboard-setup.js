// PAD-444 (flow 113): mint a fresh join token as the seeded coach, so the flow can open the QR
// link the student would have scanned (Maestro cannot read a QR). e2e-student-3 has no coach.
// Exposes: output.api, output.coachTok, output.joinToken.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
output.api = api;
output.coachTok = json(login.body).accessToken;
var minted = http.post(api + "/api/app/coach/join-token", {
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok },
  body: "{}",
});
output.joinToken = json(minted.body).token;
