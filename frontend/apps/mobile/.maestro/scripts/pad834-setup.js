// PAD-834 (flows 333-player-needs-configuring, 334-player-pending-registration, 336-players-list-
// pending-filter): a placeholder this flow owns — added with no level and no side, so it is both
// pending registration and needs configuring. Teardown deletes it (R-040).
// Exposes: output.api, output.coachTok, output.pendingId, output.pendingName.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var json_ = { "Content-Type": "application/json" };
output.api = api;
output.coachTok = json(http.post(api + "/api/auth/login", {
  headers: json_,
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
}).body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
output.pendingName = "Maestro Pending " + new Date().getTime();
var created = json(http.post(api + "/api/app/add_player", {
  headers: auth,
  body: JSON.stringify({ name: output.pendingName }),
}).body);
output.pendingId = String(created.playerId);
