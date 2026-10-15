// PAD-655 (flow 280): a level ladder long enough to overflow the select's list box (max-h-96,
// about 9 rows): 14 extra levels after the seed's two, so the last one starts far below the
// fold. Teardown deletes them (R-040).
// Exposes: output.api, output.coachTok.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
output.api = api;
output.coachTok = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
var levels = [];
for (var i = 1; i <= 14; i++) {
  var n = i < 10 ? "0" + i : "" + i;
  levels.push({ code: "P655-" + n, label: "Scroll " + n, displayOrder: 100 + i });
}
var res = http.post(api + "/api/app/add_coach_level", { headers: auth, body: JSON.stringify(levels) });
if (!res.ok) throw new Error("pad655-setup: add_coach_level " + res.status + " " + res.body);
