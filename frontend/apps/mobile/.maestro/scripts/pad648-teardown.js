// PAD-648 (flow 289): remove the one message the setup posted (R-040). Guarded so a setup that
// never logged in is a no-op.
if (typeof output.studentTok !== "undefined" && output.messageId) {
  http.delete(output.api + "/api/app/message/" + output.messageId, {
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + output.studentTok },
  });
}
