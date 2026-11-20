// PAD-834: delete the placeholder pad834-setup.js created (R-040), whether the flow passed or not.
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
if (output.pendingId) {
  http.post(output.api + "/api/app/remove_player", {
    headers: auth,
    body: JSON.stringify({ playerId: output.pendingId, action: "delete" }),
  });
}
