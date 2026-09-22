// PAD-373 (flows 34 and 77): the id the server gave a competency the flow just added, so its
// row can be found by TEST ID ("competency-delete-id-<n>") instead of by rendered copy.
// Needs output.api and output.coachTok (scripts/competency-manager-setup.js) and env NAME.
// The add lands a moment after Enter, so the read is repeated a bounded number of times —
// Maestro's JS has no sleep; each round trip is the pause.
// Exposes: output.competencyId ("" when the server never held it — the flow then fails on
// an id that cannot exist, which is the right failure).
var found = "";
for (var attempt = 0; attempt < 40 && found === ""; attempt++) {
  var held = json(
    http.get(output.api + "/api/app/evaluation_competencies", { headers: { Authorization: "Bearer " + output.coachTok } }).body
  ).competencies;
  for (var i = 0; i < held.length; i++) {
    if (held[i].name === NAME) found = String(held[i].id);
  }
}
output.competencyId = found;
