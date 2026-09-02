// Computes the date of the seeded "E2E Academy Class" — the NEXT Monday
// strictly after today, mirroring apps/web/e2e/scripts/seed.py:
//   days_until_monday = (7 - today.weekday()) % 7 or 7
// Exposes:
//   output.seededMonday  — yyyy-MM-dd of next Monday (seeded class date)
//   output.tomorrow      — yyyy-MM-dd of tomorrow (used by blocker flows)
//   output.today         — yyyy-MM-dd of today (used by 13-student-availability,
//                           which drives the native date picker's own default)
var now = new Date();
// JS getDay(): 0=Sun..6=Sat → python weekday(): 0=Mon..6=Sun
var weekday = (now.getDay() + 6) % 7;
var daysUntilMonday = (7 - weekday) % 7;
if (daysUntilMonday === 0) daysUntilMonday = 7;

function fmt(d) {
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return (
    d.getFullYear() +
    "-" +
    (m < 10 ? "0" + m : "" + m) +
    "-" +
    (day < 10 ? "0" + day : "" + day)
  );
}

output.seededMonday = fmt(
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilMonday)
);
output.tomorrow = fmt(
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
);
output.today = fmt(now);
