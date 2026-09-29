// PAD-438 / B-223 (flow 116): while the student's dashboard is on screen, the coach adds a class
// with them two days out, so the next refresh lays out new rows ABOVE "Your record".
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
var made = http.post(output.api + "/api/app/add_class", {
  headers: auth,
  body: JSON.stringify({
    name: "Maestro PAD-438", classType: "academy", maxPlayers: 4, date: output.day,
    startTime: "19:00", endTime: "20:00", isRecurring: false, notificationsEnabled: false,
    playerIds: [output.pid],
  }),
});
output.inserted = made.status;
