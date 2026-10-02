// PAD-481 (flow 133): put the coach's own eligibility bar back (R-040), even when a step failed.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + json(login.body).accessToken };
var saved = typeof output.savedRules === "undefined" ? "null" : output.savedRules;
http.post(api + "/api/app/notify/config", {
  headers: auth,
  body: JSON.stringify({ eligibilityRules: JSON.parse(saved) }),
});
