// PAD-376 (flow 80): remove the class and the record the flow made (R-040).
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
var history = json(http.get(output.api + "/api/app/player/" + output.evalPlayerId + "/evaluations", { headers: auth }).body);
for (var r = 0; r < history.records.length; r++) {
  http.delete(output.api + "/api/app/evaluation_record/" + history.records[r].id, { headers: auth });
}
// Student Two: only TODAY's record in the yesterday class (editable, that class name); the seeded
// yesterday record and the seeded history stay exactly as found.
var two = json(http.get(output.api + "/api/app/player/" + output.student2Id + "/evaluations", { headers: auth }).body);
for (var s = 0; s < two.records.length; s++) {
  if (two.records[s].editable && two.records[s].className === output.yesterdayTitle) {
    http.delete(output.api + "/api/app/evaluation_record/" + two.records[s].id, { headers: auth });
  }
}
http.request(output.api + "/api/app/evaluation_competency/" + output.techniqueId, { method: "PATCH", headers: auth, body: JSON.stringify({ isActive: false }) });
http.post(output.api + "/api/app/remove_class", { headers: auth, body: JSON.stringify({ event: output.classEvent, scope: "single" }) });
output.left = json(http.get(output.api + "/api/app/player/" + output.evalPlayerId + "/evaluations", { headers: auth }).body).records.length;
var twoAfter = json(http.get(output.api + "/api/app/player/" + output.student2Id + "/evaluations", { headers: auth }).body).records;
var yesterdayLeft = 0;
for (var q = 0; q < twoAfter.length; q++) { if (twoAfter[q].className === output.yesterdayTitle) yesterdayLeft++; }
output.yesterdayLeft = yesterdayLeft; // 1 = the seeded record alone
