// PAD-496 (flow 145): remove every "Maestro PAD-496 …" class in the next fifteen days.
// Runs before the flow and from onFlowComplete, so a flow that fails halfway leaves nothing behind (R-040).
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + json(login.body).accessToken };

function day(n) {
  var d = new Date(Date.now() + n * 86400000);
  var m = d.getMonth() + 1, dd = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" + m : "" + m) + "-" + (dd < 10 ? "0" + dd : "" + dd);
}

var events = json(http.get(api + "/api/app/calendar?from=" + day(0) + "T00:00:00&to=" + day(15) + "T23:59:59", { headers: auth }).body);
var removed = 0;
for (var i = 0; i < events.length; i++) {
  var e = events[i];
  if (e.type === "class" && String(e.title).indexOf("Maestro PAD-496") === 0) {
    http.post(api + "/api/app/remove_class", { headers: auth, body: JSON.stringify({ event: e, scope: "single" }) });
    removed++;
  }
}
output.pad496Removed = removed;
