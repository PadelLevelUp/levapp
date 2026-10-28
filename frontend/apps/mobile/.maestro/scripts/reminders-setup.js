// PAD-776 part 3 (flow 310): a known starting state for the iOS Reminders panel. It keeps the
// coach's config to restore in teardown (R-040), turns the engine on (the panel is disabled while
// it is off) and sets the invitation start to "7 days before at 19:30", the rest of the timing kept.
// Exposes: output.api, output.coachTok, output.saved.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
output.api = api;
output.coachTok = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };

var cfg = json(http.get(api + "/api/app/notify/config", { headers: auth }).body);
output.saved = JSON.stringify({ autoNotifyEnabled: cfg.autoNotifyEnabled, reminderTiming: cfg.reminderTiming });

var timing = JSON.parse(JSON.stringify(cfg.reminderTiming));
timing.invitationStart = { type: "days_before_at_time", days: 7, time: "19:30" };
http.post(api + "/api/app/notify/config", {
  headers: auth,
  body: JSON.stringify({ autoNotifyEnabled: true, reminderTiming: timing }),
});
