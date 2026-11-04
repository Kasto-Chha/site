// How the discussions list shows a thread a business is tagged to: by the business's name and
// category, with a Business mark. For the eye only. The thread's own title is kept as
// `postTitle`, because a reply must be sent under it to land in the same thread. Pure.
export function applyBusinesses(topics, businesses) {
  const known = businesses || {};
  return topics.map((topic) => {
    const business = known[topic.slug];
    if (!business) return topic;
    return { ...topic, postTitle: topic.title, title: business.title, category: business.category, business };
  });
}
