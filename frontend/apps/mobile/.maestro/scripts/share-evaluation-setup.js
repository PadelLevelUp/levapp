// PAD-402 (flow 81, evaluations.sharing/student-view): ensures E2E Student Two
// (e2e-student-2) has a rated evaluation record to share, and that it starts
// UNSHARED (idempotent DELETE), so a rerun after a partial failure is clean. The
// seed's own history for this student already holds a rated record
// (evaluations.evolution's dataset, PAD-375/376) — the fallback below only fires if
// that ever stops being true.
// Exposes: output.api, output.coachTok, output.studentPlayerId, output.recordId,
//          output.otherCategoryId ("" when the record holds only one rating — step 1
//          then has nothing else to untick), output.createdRecord, output.createdCompetencyId
//          ("" when nothing was created; both read by the teardown, R-040).
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var jsonHeaders = { "Content-Type": "application/json" };

var login = http.post(api + "/api/auth/login", {
  headers: jsonHeaders,
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
var token = json(login.body).accessToken;
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + token };

var roster = json(http.get(api + "/api/app/coach_players", { headers: auth }).body);
var players = roster.items ? roster.items : roster;
var student = null;
for (var i = 0; i < players.length; i++) {
  if (players[i].name === "E2E Student Two") student = players[i];
}

var history = json(http.get(api + "/api/app/player/" + student.playerId + "/evaluations", { headers: auth }).body);
var record = null;
for (var r = 0; r < history.records.length; r++) {
  if (history.records[r].ratings.length > 0) {
    record = history.records[r];
    break;
  }
}

var createdRecord = false;
var createdCompetencyId = "";
if (record === null) {
  // Fallback only — the seed is expected to have filed this already.
  var technique = json(
    http.post(api + "/api/app/evaluation_competency", { headers: auth, body: JSON.stringify({ catalogueKey: "technique" }) }).body
  );
  createdCompetencyId = String(technique.id);
  var body = { playerId: student.playerId, ratings: {} };
  body.ratings[String(technique.id)] = 4;
  record = json(http.put(api + "/api/app/evaluation_record", { headers: auth, body: JSON.stringify(body) }).body);
  createdRecord = true;
}

// A clean, unshared start (sharing rule 9's unshare is a silent no-op when there is
// nothing to remove) — so this flow's own rerun after a partial failure is safe.
http.delete(api + "/api/app/evaluation_record/" + record.id + "/share", { headers: auth });

output.api = api;
output.coachTok = token;
output.studentPlayerId = String(student.playerId);
output.recordId = String(record.id);
output.otherCategoryId = record.ratings.length > 1 ? String(record.ratings[1].categoryId) : "";
output.createdRecord = createdRecord;
output.createdCompetencyId = createdCompetencyId;
