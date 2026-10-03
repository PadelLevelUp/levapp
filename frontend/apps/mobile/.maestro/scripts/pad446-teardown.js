// PAD-446 (flow 153): remove the standing entry the setup added (it deactivates every class entry
// it fanned out). Guarded: a setup that never added one is a no-op.
if (typeof output.entryId !== "undefined" && output.entryId) {
  http.delete(output.api + "/api/app/notify/standing_waiting_list/" + output.entryId, {
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok },
  });
}
