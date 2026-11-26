// auth.invite-welcome (flow 331): as the seeded coach, mint a join token (as flow 113) and a player invitation
// through the existing create route (as flow 189), so the flow can open both links. The create route answers the
// invite token only. Exposes: output.api, output.coachTok, output.joinToken, output.playerInviteToken.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
output.api = api;
output.coachTok = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
output.joinToken = json(http.post(api + "/api/app/coach/join-token", { headers: auth, body: "{}" }).body).token;
var me = json(http.get(api + "/api/auth/me", { headers: auth }).body);
output.playerInviteToken = json(
  http.post(api + "/api/app/incomplete_player", {
    headers: auth,
    body: JSON.stringify({ coachId: me.coachId, name: "Maestro Invitee", side: "left" }),
  }).body
).token;
