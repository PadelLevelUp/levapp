// PAD-438 / B-223 (flow 116): remove the flow's class, then the two messages it left in seeded
// conversation 1: "added you to Maestro PAD-438" (metadata.addedToClass) and its cancellation
// (metadata.classCancellation), both sent as the coach, both newer than output.lastMsgId (R-040).
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.coachTok };
var events = json(http.get(output.api + "/api/app/calendar?from=" + output.rangeFrom + "T00:00:00&to=" + output.rangeTo + "T23:59:59", { headers: auth }).body);
for (var j = 0; j < events.length; j++) {
  if (events[j].type === "class" && String(events[j].title).indexOf("Maestro PAD-438") === 0) {
    http.post(output.api + "/api/app/remove_class", { headers: auth, body: JSON.stringify({ event: events[j], scope: "single" }) });
  }
}

var thread = json(http.get(output.api + "/api/app/conversation/1?limit=30", { headers: auth }).body);
var cleaned = 0;
for (var m = 0; m < thread.messages.length; m++) {
  var msg = thread.messages[m];
  var meta = msg.metadata || {};
  if (msg.id > output.lastMsgId && msg.senderId === output.coachUserId && !msg.isDeleted
      && (meta.addedToClass || meta.classCancellation)) {
    http.delete(output.api + "/api/app/message/" + msg.id, { headers: auth });
    cleaned++;
  }
}
output.cleaned = cleaned;
