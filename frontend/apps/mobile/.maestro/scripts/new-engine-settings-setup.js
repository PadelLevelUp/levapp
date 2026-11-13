// PAD-920 (flow 319): what the new engine's settings looked like before the flow, so teardown can
// put them back (R-040). The coach must already be on the new engine (the flow's hand-run setup).
// Exposes: output.api, output.coachTok, output.engineVersion, output.maxBefore, output.saved.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
output.api = api;
output.coachTok = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };

var cfg = json(http.get(api + "/api/app/notify/config", { headers: auth }).body);
output.engineVersion = cfg.engineVersion;
// Rule 20: a null "at a time" is the engine's default, ENGINE_DEFAULT_MAX_AT_A_TIME (12).
output.maxBefore = cfg.engine && cfg.engine.maxAtATime != null ? cfg.engine.maxAtATime : 12;
output.saved = JSON.stringify({
  engine: cfg.engine || {
    maxAtATime: null,
    timing: { method: "fixed", betweenRoundsMinutes: null, betweenGroupsMinutes: null },
    autoEntryBeforeAttendanceRequest: false,
    waitingListSideChoice: false,
  },
  invitationGroups: cfg.invitationGroups || [],
});
