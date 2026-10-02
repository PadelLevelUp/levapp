// PAD-475 (flow 122): the message the push announces, posted while the coach's app is in
// the background. `cacheAgeMs` is how old the thread's cache entry is at that point: under
// the app's 30 s staleTime the open that follows finds a FRESH entry, which is the case
// the bug needs (a stale entry refetches on mount by itself).
var auth = { "Content-Type": "application/json", Authorization: "Bearer " + output.studentTok };
var res = http.post(output.api + "/api/app/message", {
  headers: auth,
  body: JSON.stringify({ conversationId: "1", text: "PAD-475 warm push probe", replyToId: null }),
});
output.newId = json(res.body).id;
output.postedIds = String(output.newId);
output.cacheAgeMs = Date.now() - output.cachedAt;
console.log("PAD-475 newId=" + output.newId + " cacheAgeMs=" + output.cacheAgeMs);
