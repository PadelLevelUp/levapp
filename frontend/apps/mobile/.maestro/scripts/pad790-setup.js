// PAD-790 / B-710 (flow 315): one class late on Thursday of next week, 21:30–22:30, so the week grid
// runs to 23:00 and its last rows sit under the day sheet unless the grid's end is padded.
// Exposes: output.pad790Date (yyyy-MM-dd of that Thursday).
var api = typeof API_BASE === "undefined" ? "http://localhost:5001" : API_BASE;
var login = http.post(api + "/api/auth/login", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "e2e-coach", password: "E2eCoach123!" }),
});
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + json(login.body).accessToken };

function fmt(d) {
  var m = d.getMonth() + 1, dd = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" + m : "" + m) + "-" + (dd < 10 ? "0" + dd : "" + dd);
}
var now = new Date();
// Weeks start on Sunday (calendar.view rule 5a, PAD-682); next week's first day is strictly after today.
var untilSunday = (7 - now.getDay()) % 7;
if (untilSunday === 0) untilSunday = 7;
output.pad790Date = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() + untilSunday + 4));

http.post(api + "/api/app/add_class", {
  headers: auth,
  body: JSON.stringify({
    name: "Maestro PAD-790 late", classType: "academy", maxPlayers: 4, color: "#6366f1",
    date: output.pad790Date, startTime: "21:30", endTime: "22:30",
    isRecurring: false, playerIds: [],
  }),
});
