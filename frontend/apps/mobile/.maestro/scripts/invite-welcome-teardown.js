// auth.invite-welcome (flow 331): disconnect e2e-student-3 again (as flow 113's teardown) and delete the
// never-activated "Maestro Invitee" placeholder (players.remove rule 5), so the seeded roster is as it was (R-040),
// even after an interrupted run. Guarded: a setup that never logged in is a no-op.
if (typeof output.coachTok !== "undefined") {
  var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
  var roster = json(http.get(output.api + "/api/app/coach_players", { headers: auth }).body);
  var rows = roster.items ? roster.items : roster;
  for (var i = 0; i < rows.length; i++) {
    var gone = rows[i].name === "E2E Student Three" || (rows[i].name === "Maestro Invitee" && rows[i].claimable);
    if (gone) {
      http.post(output.api + "/api/app/remove_player", {
        headers: auth,
        body: JSON.stringify({ playerId: rows[i].playerId }),
      });
    }
  }
}
