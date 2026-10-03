// PAD-496 (flow 145): a busy week. Fourteen classes next week, two a day, so the picker's list is
// several screens long on any phone. The last one (Sunday 22:00) is the class the flow must reach.
// Exposes: output.pad496Last — the id the picker gives that class (its row is
// `add-to-classes-class-<id>`).
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
// JS getDay(): 0=Sun..6=Sat → Monday-based weekday 0..6; next Monday is strictly after today.
var weekday = (now.getDay() + 6) % 7;
var untilMonday = (7 - weekday) % 7;
if (untilMonday === 0) untilMonday = 7;
function nextWeekDay(n) {
  return fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() + untilMonday + n));
}

var made = 0;
for (var d = 0; d < 7; d++) {
  var slots = [["07:00", "08:00"], ["22:00", "23:00"]];
  for (var s = 0; s < slots.length; s++) {
    made++;
    http.post(api + "/api/app/add_class", {
      headers: auth,
      body: JSON.stringify({
        name: "Maestro PAD-496 " + (made < 10 ? "0" + made : "" + made),
        classType: "academy", maxPlayers: 4, color: "#6366f1",
        date: nextWeekDay(d), startTime: slots[s][0], endTime: slots[s][1],
        isRecurring: false, playerIds: [],
      }),
    });
  }
}

var week = json(http.get(api + "/api/app/lesson_instances?from=" + nextWeekDay(0) + "&to=" + nextWeekDay(6), { headers: auth }).body);
output.pad496Last = "";
for (var i = 0; i < week.length; i++) {
  if (week[i].title === "Maestro PAD-496 14") output.pad496Last = "" + week[i].id;
}
output.pad496Made = made;
