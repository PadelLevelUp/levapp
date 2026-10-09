// PAD-569 (flow 240): remove the filler messages and the one the flow typed ("Maestro
// keyboard"), found as the newest message of conversation 1 (R-040). Guarded so a setup
// that never logged in is a no-op.
if (typeof output.studentTok !== "undefined" && output.postedIds) {
  var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.studentTok };
  // Only the row this flow typed: newer than the last filler it posted, with the flow's text
  // (R-040 — never another run's "Maestro keyboard").
  var detail = http.get(output.api + "/api/app/conversation/1", { headers: auth });
  var msgs = json(detail.body).messages || [];
  for (var m = 0; m < msgs.length; m++) {
    if (Number(msgs[m].id) > Number(output.newestId) && msgs[m].content === "Maestro keyboard") {
      http.delete(output.api + "/api/app/message/" + msgs[m].id, { headers: auth });
    }
  }
  var ids = String(output.postedIds).split(",");
  for (var i = 0; i < ids.length; i++) {
    http.delete(output.api + "/api/app/message/" + ids[i], { headers: auth });
  }
}
