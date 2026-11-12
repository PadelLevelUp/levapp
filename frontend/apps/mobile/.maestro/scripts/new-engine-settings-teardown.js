// PAD-920 (flow 319): put back the new engine's settings the setup found (R-040). Guarded so a
// setup that never logged in is a no-op.
if (typeof output.coachTok !== "undefined" && output.saved) {
  http.post(output.api + "/api/app/notify/config", {
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok },
    body: output.saved,
  });
}
