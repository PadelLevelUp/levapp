// PAD-684 (flow 302): remove the class the flow booked ("E2E 684 Come Back", five days out) through
// the coach's API, whether the flow passed or not (R-040).
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + json(login.body).accessToken };
function fmt(d) {
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" + m : "" + m) + "-" + (day < 10 ? "0" + day : "" + day);
}
for (var pass = 0; pass < 3; pass++) {
  var from = fmt(new Date(Date.now() + 4 * 86400000));
  var to = fmt(new Date(Date.now() + 6 * 86400000));
  var events = json(
    http.get(api + "/api/app/calendar?from=" + from + "T00:00:00&to=" + to + "T23:59:59", { headers: auth }).body
  );
  var left = 0;
  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    if (e.type === "class" && e.title === "E2E 684 Come Back") {
      http.post(api + "/api/app/remove_class", { headers: auth, body: JSON.stringify({ event: e, scope: "single" }) });
      left++;
    }
  }
  if (left === 0) break;
}
