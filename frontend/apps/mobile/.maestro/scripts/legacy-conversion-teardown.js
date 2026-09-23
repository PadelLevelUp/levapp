// PAD-403 (flow 98): remove the record and the category the flow made (R-040).
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
var history = json(http.get(output.api + "/api/app/player/" + output.evalPlayerId + "/evaluations", { headers: auth }).body);
for (var r = 0; r < history.records.length; r++) {
  http.delete(output.api + "/api/app/evaluation_record/" + history.records[r].id, { headers: auth });
}
http.delete(output.api + "/api/app/evaluation_competency/" + output.categoryId, { headers: auth });
output.left = json(http.get(output.api + "/api/app/player/" + output.evalPlayerId + "/evaluations", { headers: auth }).body).records.length;
