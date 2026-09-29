// PAD-463 (flow 115): a Sunday about two years out (no season or other flow's class there), the
// five dates a Sunday+Wednesday series ending "after 5 classes" must hold, and no leftover
// "Maestro PAD-463" series in that range (removed with scope future from its first occurrence).
// Exposes: output.api, output.coachTok, output.startDate, output.expected (comma-separated),
// output.rangeTo.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
output.api = api;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
output.coachTok = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };

function iso(d) { return d.toISOString().slice(0, 10); }
var now = new Date();
var d = new Date(Date.UTC(now.getUTCFullYear() + 2, now.getUTCMonth(), now.getUTCDate()));
d = new Date(d.getTime() + ((7 - d.getUTCDay()) % 7) * 86400000);
function plus(n) { return iso(new Date(d.getTime() + n * 86400000)); }
output.startDate = plus(0);
output.expected = [plus(0), plus(3), plus(7), plus(10), plus(14)].join(",");
output.rangeTo = plus(28);

var events = json(http.get(api + "/api/app/calendar?from=" + plus(0) + "T00:00:00&to=" + plus(28) + "T23:59:59", { headers: auth }).body);
var seen = {};
for (var i = 0; i < events.length; i++) {
  var e = events[i];
  if (e.type === "class" && String(e.title).indexOf("Maestro PAD-463") === 0 && !seen[e.title]) {
    seen[e.title] = true;
    http.post(api + "/api/app/remove_class", { headers: auth, body: JSON.stringify({ event: e, scope: "future" }) });
  }
}
