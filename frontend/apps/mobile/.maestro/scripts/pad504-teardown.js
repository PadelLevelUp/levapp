// PAD-504 (flow 144): leave the list if still on it, remove the class (two passes, as flow 66),
// restore the coach's open-spots toggle (R-040). Guarded: a setup that never logged in is a no-op.
if (typeof output.coachTok !== "undefined") {
  var coach = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
  if (output.instanceId) {
    http.post(output.api + "/api/app/class-waiting-list/" + output.instanceId + "/leave", {
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + output.student },
      body: "{}",
    });
  }
  for (var pass = 0; pass < 2; pass++) {
    var evs = json(http.get(output.api + "/api/app/calendar?from=" + output.day + "T00:00:00&to=" + output.day + "T23:59:59", { headers: coach }).body);
    for (var i = 0; i < evs.length; i++) {
      if (evs[i].type === "class" && evs[i].title === output.title) {
        http.post(output.api + "/api/app/remove_class", { headers: coach, body: JSON.stringify({ event: evs[i], scope: "single" }) });
      }
    }
  }
  http.post(output.api + "/api/app/notify/config", { headers: coach, body: JSON.stringify({ openSpotsVisible: output.wasVisible }) });
}
