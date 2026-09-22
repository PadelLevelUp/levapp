// PAD-376 (flow 80): remove the class and the record the flow made (R-040).
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
var history = json(http.get(output.api + "/api/app/player/" + output.evalPlayerId + "/evaluations", { headers: auth }).body);
for (var r = 0; r < history.records.length; r++) {
  http.delete(output.api + "/api/app/evaluation_record/" + history.records[r].id, { headers: auth });
}
http.post(output.api + "/api/app/remove_class", { headers: auth, body: JSON.stringify({ event: output.classEvent, scope: "single" }) });
output.left = json(http.get(output.api + "/api/app/player/" + output.evalPlayerId + "/evaluations", { headers: auth }).body).records.length;
