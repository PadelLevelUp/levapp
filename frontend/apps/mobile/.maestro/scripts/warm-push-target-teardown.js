// PAD-475 (flow 122): remove the message the flow posted (R-040). Guarded so a setup
// that never logged in, or a flow that died before posting, is a no-op.
if (typeof output.studentTok !== "undefined" && output.postedIds) {
  var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.studentTok };
  var ids = String(output.postedIds).split(",");
  for (var i = 0; i < ids.length; i++) {
    http.delete(output.api + "/api/app/message/" + ids[i], { headers: auth });
  }
}
