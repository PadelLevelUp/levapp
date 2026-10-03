// PAD-492 (flow 143): in the e2e-coach <-> e2e-student-2 thread, one message the student
// TYPES and one the app WRITES (the coach shares a rated evaluation: message_type "system").
// The flow asserts the automatic-note line on the second and not on the first, by message id.
// Exposes: output.api, output.coachTok, output.recordId, output.conversationId,
//          output.typedId, output.autoId (read by the teardown, R-040).
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var jsonHeaders = { "Content-Type": "application/json" };
function tokenFor(username, password) {
  var res = http.post(api + "/api/auth/login", {
    headers: jsonHeaders,
    body: JSON.stringify({ username: username, password: password }),
  });
  return json(res.body).accessToken;
}
var coach = { "Content-Type": "application/json", Authorization: "Bearer " + tokenFor("e2e-coach", "E2eCoach123!") };
var student = { "Content-Type": "application/json", Authorization: "Bearer " + tokenFor("e2e-student-2", "E2eStudent2123!") };

var conv = json(http.post(api + "/api/app/conversation", {
  headers: student,
  body: JSON.stringify({ otherUsername: "e2e-coach" }),
}).body);
var typed = json(http.post(api + "/api/app/message", {
  headers: student,
  body: JSON.stringify({ conversationId: String(conv.id), text: "PAD-492 typed " + Date.now(), replyToId: null }),
}).body);

var roster = json(http.get(api + "/api/app/coach_players", { headers: coach }).body);
var players = roster.items ? roster.items : roster;
var studentTwo = null;
for (var i = 0; i < players.length; i++) {
  if (players[i].name === "E2E Student Two") studentTwo = players[i];
}
var history = json(http.get(api + "/api/app/player/" + studentTwo.playerId + "/evaluations", { headers: coach }).body);
var record = null;
for (var r = 0; r < history.records.length; r++) {
  if (history.records[r].ratings.length > 0) { record = history.records[r]; break; }
}
http.delete(api + "/api/app/evaluation_record/" + record.id + "/share", { headers: coach });
http.post(api + "/api/app/evaluation_record/" + record.id + "/share", {
  headers: coach,
  body: JSON.stringify({ categoryIds: [record.ratings[0].categoryId], evolution: "none", includeNote: false }),
});

var thread = json(http.get(api + "/api/app/conversation/" + conv.id + "?limit=50", { headers: student }).body);
var autoId = 0;
for (var m = thread.messages.length - 1; m >= 0; m--) {
  if (thread.messages[m].isAutomatic) { autoId = thread.messages[m].id; break; }
}

output.api = api;
output.coachTok = coach.Authorization.replace("Bearer ", "");
output.recordId = String(record.id);
output.conversationId = String(conv.id);
output.typedId = typed.id;
output.typedAutomatic = typed.isAutomatic === true;
output.autoId = autoId;
