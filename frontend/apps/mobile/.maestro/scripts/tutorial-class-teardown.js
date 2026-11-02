// PAD-816 (flows 43 and 153): remove the class tutorial-class-setup.js created. Two passes, as flow
// 65: removing a materialised instance leaves its Lesson re-projecting. A no-op without the setup.
if (typeof output.tutorialDay !== "undefined" && output.tutorialDay) {
  var coach = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
  for (var pass = 0; pass < 2; pass++) {
    var events = json(http.get(output.api + "/api/app/calendar?from=" + output.tutorialDay + "T00:00:00&to=" +
      output.tutorialDay + "T23:59:59", { headers: coach }).body);
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type === "class" && e.title === output.tutorialClass) {
        http.post(output.api + "/api/app/remove_class", {
          headers: coach, body: JSON.stringify({ event: e, scope: "single" }),
        });
      }
    }
  }
}
