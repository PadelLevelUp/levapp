// PAD-655 (flow 280): remove the 14 levels pad655-setup.js added (R-040).
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + json(login.body).accessToken };
var all = json(http.get(api + "/api/app/coach_levels", { headers: auth }).body);
var list = Array.isArray(all) ? all : all.levels || all.items || [];
for (var i = 0; i < list.length; i++) {
  if (String(list[i].code).indexOf("P655-") === 0) {
    http.post(api + "/api/app/delete/coach_level", { headers: auth, body: JSON.stringify({ id: list[i].id }) });
  }
}
