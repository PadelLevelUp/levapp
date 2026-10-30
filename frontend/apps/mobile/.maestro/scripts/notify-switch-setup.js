// PAD-793 (flow 314): a Tuesday about two years out (no season or other flow's class there) and no
// leftover "Maestro PAD-793" class on it. Exposes: output.api, output.coachTok, output.day.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
output.api = api;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
output.coachTok = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };

var now = new Date();
var d = new Date(Date.UTC(now.getUTCFullYear() + 2, now.getUTCMonth(), now.getUTCDate()));
d = new Date(d.getTime() + ((9 - d.getUTCDay()) % 7) * 86400000);
output.day = d.toISOString().slice(0, 10);

var events = json(http.get(api + "/api/app/calendar?from=" + output.day + "T00:00:00&to=" + output.day + "T23:59:59", { headers: auth }).body);
for (var i = 0; i < events.length; i++) {
  var e = events[i];
  if (e.type === "class" && String(e.title).indexOf("Maestro PAD-793") === 0) {
    http.post(api + "/api/app/remove_class", { headers: auth, body: JSON.stringify({ event: e, scope: "single" }) });
  }
}
