// PAD-373 (flows 34 and 77): a known starting point for "Gerir competências", through the API.
//   - logs in as the seeded coach
//   - deletes every competency of the coach's OWN whose name starts with "Maestro " — what a
//     run that died half-way left behind, which would otherwise answer 409 duplicate_name
//   - makes the catalogue competency "vibora" exist and be switched OFF (idempotent POST, then
//     PATCH), so flow 77's toggle always starts from the same side
// Exposes: output.api, output.coachTok, output.forehandId (the seeded legacy category)
// API_BASE is passed by scripts/e2e.sh; the default is the shared E2E backend.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;

var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
var token = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + token };

var held = json(http.get(api + "/api/app/evaluation_competencies", { headers: auth }).body).competencies;
var forehand = null;
for (var i = 0; i < held.length; i++) {
  var c = held[i];
  if (!c.key && c.name.indexOf("Maestro ") === 0) {
    // Maestro's http.delete takes no body; the route needs none.
    http.delete(api + "/api/app/evaluation_competency/" + c.id, { headers: auth });
  }
  if (!c.key && c.group === null && c.name === "Forehand") forehand = c;
}

var vibora = json(
  http.post(api + "/api/app/evaluation_competency", { headers: auth, body: JSON.stringify({ catalogueKey: "vibora" }) }).body
);
http.request(api + "/api/app/evaluation_competency/" + vibora.id, {
  method: "PATCH",
  headers: auth,
  body: JSON.stringify({ isActive: false }),
});

output.api = api;
output.coachTok = token;
output.forehandId = forehand ? String(forehand.id) : "";
