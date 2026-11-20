// PAD-839 (flows 337-340): make a NEW student who joined the seeded coach through a join link, so
// the setup guide is live for her (the E2E seed hides the guide for every seeded student).
// Registers through the API, confirms the email with the debug code, signs in and accepts a join
// token minted by the coach: coach_link done, nothing else, so the guide reads 20%.
// Exposes: output.api, output.coachTok, output.studentTok, output.username, output.password,
// output.name.
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var jsonHeaders = { "Content-Type": "application/json" };
var stamp = String(new Date().getTime());
var username = "maestro-guide-" + stamp;
var email = username + "@example.com";
var password = "Segura1234";
var name = "Maestro Guide " + stamp;

var coachLogin = http.post(api + "/api/auth/login", {
  headers: jsonHeaders,
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
var coachTok = json(coachLogin.body).accessToken;
var minted = http.post(api + "/api/app/coach/join-token", {
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + coachTok },
  body: "{}",
});
var joinToken = json(minted.body).token;

// Declaring terms-acceptance makes the server record the acceptance, so the app does not stop the
// new account on the legal catch-up screen.
http.post(api + "/api/auth/register", {
  headers: { "Content-Type": "application/json", "X-LevApp-Capabilities": "terms-acceptance" },
  body: JSON.stringify({
    role: "student", name: name, username: username, email: email,
    password: password, birthDate: "2000-01-01", country: "PT", termsAccepted: true,
  }),
});
var studentLogin = http.post(api + "/api/auth/login", {
  headers: jsonHeaders,
  body: JSON.stringify({ username: username, password: password }),
});
var studentTok = json(studentLogin.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + studentTok };

// Email code: the register mail is captured; ask for a fresh one if it is not there.
var codeRes = http.get(api + "/api/auth/email-verification/debug/last-code?email=" + email);
if (codeRes.status !== 200) {
  http.post(api + "/api/auth/email-verification/send", { headers: auth, body: "{}" });
  codeRes = http.get(api + "/api/auth/email-verification/debug/last-code?email=" + email);
}
http.post(api + "/api/auth/email-verification/confirm", {
  headers: auth,
  body: JSON.stringify({ code: json(codeRes.body).code }),
});
http.post(api + "/api/app/join-tokens/" + joinToken + "/accept", { headers: auth, body: "{}" });

output.api = api;
output.coachTok = coachTok;
output.studentTok = studentTok;
output.username = username;
output.password = password;
output.name = name;
