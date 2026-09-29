// PAD-423 (flows 119, 120), run from onFlowComplete whether the flow passed or failed (R-040):
// remove the records and the competencies the flow made, and put the coach back on 1-5.
if (typeof output.coachTok !== "undefined") {
  var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
  var history = json(http.get(output.api + "/api/app/player/" + output.evalPlayerId + "/evaluations", { headers: auth }).body);
  for (var r = 0; r < history.records.length; r++) {
    http.delete(output.api + "/api/app/evaluation_record/" + history.records[r].id, { headers: auth });
  }
  var ids = [output.competencyId, output.competencyBId];
  for (var i = 0; i < ids.length; i++) {
    if (typeof ids[i] !== "undefined") http.delete(output.api + "/api/app/evaluation_competency/" + ids[i], { headers: auth });
  }
  output.restored = http.put(output.api + "/api/app/evaluation_scale", { headers: auth, body: JSON.stringify({ scaleMax: 5 }) }).ok;
}
