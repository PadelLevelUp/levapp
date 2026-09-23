// PAD-402 (flow 81): un-shares the record (sharing rule 9 — silent, idempotent) and
// removes only what setup created (R-040) — nothing, unless the fallback record and/or
// competency fired. The seeded record and its ratings are otherwise left exactly as found.
// Exposes: output.stillShared (must be false after this runs). Also runs from onFlowComplete;
// a no-op when setup never got as far as a token and a record.
if (output.coachTok && output.recordId) {
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };

http.delete(output.api + "/api/app/evaluation_record/" + output.recordId + "/share", { headers: auth });

var after = json(http.get(output.api + "/api/app/player/" + output.studentPlayerId + "/evaluations", { headers: auth }).body);
var record = null;
for (var i = 0; i < after.records.length; i++) {
  if (String(after.records[i].id) === String(output.recordId)) record = after.records[i];
}
output.stillShared = !!(record && record.share !== null && record.share !== undefined);

if (output.createdRecord) {
  http.delete(output.api + "/api/app/evaluation_record/" + output.recordId, { headers: auth });
}
if (output.createdCompetencyId) {
  http.request(output.api + "/api/app/evaluation_competency/" + output.createdCompetencyId, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ isActive: false }),
  });
}
}
