// The small line under a topic suggestion. Pure, so it can be tested.
//   an ordinary thread:  "3 experiences", or "asked, no answers yet" for a bare question
//   a business thread:   "Cafe · 3 experiences", or "Cafe · no experiences yet"
export function suggestMeta(topic) {
  const count = Number(topic && topic.experiences) || 0;
  if (topic && topic.business) {
    const kind = (topic.kindName || "Business").toString();
    return `${kind} · ${count === 0 ? "no experiences yet" : `${count} ${count === 1 ? "experience" : "experiences"}`}`;
  }
  return count === 0 ? "asked, no answers yet" : `${count} ${count === 1 ? "experience" : "experiences"}`;
}
