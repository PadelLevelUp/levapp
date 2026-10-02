// PAD-481 (flow 133): a known starting bar — one level rule, "within 2 levels", both ways
// (within_n_of_class, the operation every bar set before PAD-481 holds). Keeps the coach's
// own bar to restore in teardown (R-040).
// Exposes: output.api, output.coachTok, output.savedRules, output.readRule.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
output.api = api;
output.coachTok = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };

var cfg = json(http.get(api + "/api/app/notify/config", { headers: auth }).body);
output.savedRules = JSON.stringify(cfg.eligibilityRules === undefined ? null : cfg.eligibilityRules);

http.post(api + "/api/app/notify/config", {
  headers: auth,
  body: JSON.stringify({ eligibilityRules: [{ attribute: "level", operation: "within_n_of_class", value: 2 }] }),
});
