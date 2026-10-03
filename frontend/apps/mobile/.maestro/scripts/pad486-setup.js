// PAD-486 / PAD-490 (flows 151, 152): e2e-student-3 (no coach in the seed) joins e2e-coach by
// link through the API, so their link has neither level nor side — the one path that makes an
// incomplete link today (players.join-token). Teardown removes the link again (R-040).
// Exposes: output.api, output.coachTok, output.coachId.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var json_ = { "Content-Type": "application/json" };
function tokenFor(username, password) {
  return json(http.post(api + "/api/auth/login", {
    headers: json_,
    body: JSON.stringify({ username: username, password: password }),
  }).body).accessToken;
}
output.api = api;
output.coachTok = tokenFor("e2e-coach", "E2eCoach123!");
var coachAuth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
output.coachId = json(http.get(api + "/api/app/coach", { headers: coachAuth }).body).id;
var minted = json(http.post(api + "/api/app/coach/join-token", { headers: coachAuth, body: "{}" }).body);
var studentTok = tokenFor("e2e-student-3", "E2eStudent3123!");
http.post(api + "/api/app/join-tokens/" + minted.token + "/accept", {
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + studentTok },
  body: "{}",
});
