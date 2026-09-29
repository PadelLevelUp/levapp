// PAD-438 / B-223 (flow 116): remove the flow's class (R-040).
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
var events = json(http.get(output.api + "/api/app/calendar?from=" + output.rangeFrom + "T00:00:00&to=" + output.rangeTo + "T23:59:59", { headers: auth }).body);
for (var j = 0; j < events.length; j++) {
  if (events[j].type === "class" && String(events[j].title).indexOf("Maestro PAD-438") === 0) {
    http.post(output.api + "/api/app/remove_class", { headers: auth, body: JSON.stringify({ event: events[j], scope: "single" }) });
  }
}
