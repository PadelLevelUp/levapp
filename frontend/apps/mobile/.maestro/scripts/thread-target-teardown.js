// PAD-408 (flow 103): remove every message the setup posted (R-040). Guarded so
// a setup that never logged in is a no-op.
if (typeof output.studentTok !== "undefined" && output.postedIds) {
  var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.studentTok };
  var ids = String(output.postedIds).split(",");
  for (var i = 0; i < ids.length; i++) {
    http.delete(output.api + "/api/app/message/" + ids[i], { headers: auth });
  }
}
