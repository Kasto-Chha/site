// What a visitor's browser may receive about a post. A post row carries the account id of whoever wrote it. That id was
// being sent to every visitor with every post, signed in or not, so anyone could collect them from a page's source (found
// in the security test as I4, and there since before KastoChha Sync). The browser used it for three small things: to
// show Edit and Delete on your own posts, to label replies written by the person who opened the thread (OP), and to show
// Delete on your own question. The server now answers those, for the person looking, and sends the answer, not the id:
//
//   mine    true when the signed-in viewer wrote this post
//   by_op   true when this post was written by whoever wrote the thread's first post (the oldest post in the thread)
//
// Who may edit or delete a post is still checked on the server by account on every write, so these only decide what
// the screen shows, never what is allowed.

// One post, as the person who wrote it gets it back after posting or editing: no account id, and it is theirs. `by_op`
// is not set here, because one post does not know its thread; the page works it out from the thread it already has.
export function publicPost(row, viewerId) {
  if (!row || typeof row !== "object") return row;
  const { user_id: author, ...rest } = row;
  return { ...rest, mine: Boolean(viewerId) && Boolean(author) && author === viewerId };
}

// Posts for the browser: every post without its account id, with `mine` and `by_op` for this viewer. Rows may arrive in
// any order and from several threads: the opener of a thread is the author of its oldest post. Does not change the rows
// it is given.
// `businessOwnerId` is the account linked to the business whose page this is, when it is one: a question it asked is
// marked `from_business`, so visitors can tell the business's own questions (an owner may add its own FAQs) from a
// customer's. The id itself still never leaves the server.
export function publicPosts(rows, viewerId, { businessOwnerId = null } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const openerOf = new Map();
  for (const row of list) {
    const slug = row?.topic_slug;
    if (!slug) continue;
    const current = openerOf.get(slug);
    if (!current || Date.parse(row.created_at) < Date.parse(current.created_at)) openerOf.set(slug, row);
  }
  return list.map((row) => {
    const post = publicPost(row, viewerId);
    const opener = row?.topic_slug ? openerOf.get(row.topic_slug) : null;
    return {
      ...post,
      by_op: Boolean(row?.user_id) && Boolean(opener?.user_id) && row.user_id === opener.user_id,
      from_business: Boolean(businessOwnerId) && row?.kind === "question" && row.user_id === businessOwnerId
    };
  });
}

// Whether a post the viewer has just made is by the person who opened the thread: true when the thread is new, or when
// the thread's oldest post is the viewer's own. `existing` is the posts already on the page, in any order.
export function newPostByOpener(existing) {
  const list = Array.isArray(existing) ? existing : [];
  if (!list.length) return true;
  const oldest = list.reduce((first, row) => (Date.parse(row.created_at) < Date.parse(first.created_at) ? row : first));
  return oldest.mine === true;
}
