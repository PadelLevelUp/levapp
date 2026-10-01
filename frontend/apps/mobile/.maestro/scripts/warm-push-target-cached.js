// PAD-475 (flow 122): the moment the coach's thread was on screen, i.e. its cache entry
// was last written by a GET. The post script measures the age of that entry from here.
output.cachedAt = Date.now();
