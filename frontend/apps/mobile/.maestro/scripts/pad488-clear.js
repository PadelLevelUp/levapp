// PAD-488 (flow 139): remove what the flow made, even when a step failed (R-040) — the private
// class an accept created at the flow's slot, then the request itself (a no-op once accepted).
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
function login(u, p) {
  return json(http.post(api + "/api/auth/login", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: p }),
  }).body).accessToken;
}
if (typeof output.rid !== "undefined" && output.rid !== null) {
  var coach = { "Content-Type": "application/json", Authorization: "Bearer " + login("e2e-coach", "E2eCoach123!") };
  var student = { "Content-Type": "application/json", Authorization: "Bearer " + login("e2e-student", "E2eStudent123!") };
  var evs = json(http.get(api + "/api/app/calendar?from=" + output.day + "T00:00:00&to=" + output.day + "T23:59:59", { headers: coach }).body);
  for (var i = 0; i < evs.length; i++) {
    var e = evs[i];
    if (e.type === "class" && e.startTime === output.start && e.classType === "private") {
      http.post(api + "/api/app/remove_class", { headers: coach, body: JSON.stringify({ event: e, scope: "single" }) });
    }
  }
  http.post(api + "/api/app/class-requests/" + output.rid + "/withdraw", { headers: student, body: "{}" });
}
