// PAD-433 (flow 105): a known starting state for the restrictions section. It keeps the
// coach's config to restore in teardown (R-040), turns the engine on (the section is
// disabled while it is off), sets maxSimultaneous to 3 and excludes one of the coach's
// students, whose name the chip must show (rule 14a, B-168).
// Exposes: output.api, output.coachTok, output.saved, output.pid, output.pname.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
output.api = api;
output.coachTok = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };

var cfg = json(http.get(api + "/api/app/notify/config", { headers: auth }).body);
output.saved = JSON.stringify({ autoNotifyEnabled: cfg.autoNotifyEnabled, restrictions: cfg.restrictions });

var found = json(http.get(api + "/api/app/notify/player_search?q=e", { headers: auth }).body).players;
output.pid = found[0].id;
output.pname = found[0].name;

var restrictions = JSON.parse(JSON.stringify(cfg.restrictions));
restrictions.maxSimultaneous = { enabled: true, value: 3 };
restrictions.excludedPlayers = { enabled: true, playerIds: [output.pid] };
http.post(api + "/api/app/notify/config", {
  headers: auth,
  body: JSON.stringify({ autoNotifyEnabled: true, restrictions: restrictions }),
});
