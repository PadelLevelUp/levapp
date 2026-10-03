// PAD-483 / B-267 (flow 142): the coach blocks the picked student AFTER the picker loaded,
// so the row on screen is stale and the server refuses it with 403.
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
var res = http.post(output.api + "/api/app/users/" + output.targetId + "/block", {
  headers: auth,
  body: "{}",
});
output.blockStatus = res.status;
