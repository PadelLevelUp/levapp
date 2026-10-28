// PAD-776 part 3 (flow 310): put back the engine switch and timing the setup found (R-040).
// Guarded so a setup that never logged in is a no-op.
if (typeof output.coachTok !== "undefined" && output.saved) {
  http.post(output.api + "/api/app/notify/config", {
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok },
    body: output.saved,
  });
}
