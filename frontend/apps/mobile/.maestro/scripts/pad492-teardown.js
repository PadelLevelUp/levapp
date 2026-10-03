// PAD-492 (flow 143): unshare the evaluation the setup shared (R-040).
if (output.coachTok && output.recordId) {
  http.delete(output.api + "/api/app/evaluation_record/" + output.recordId + "/share", {
    headers: { Authorization: "Bearer " + output.coachTok },
  });
}
