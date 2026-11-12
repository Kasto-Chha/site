// Stands in for @clerk/nextjs/server. The test drives who is signed in, and
// what role they carry, through globalThis.__KC_TEST__.

function state() {
  return globalThis.__KC_TEST__;
}

export async function auth() {
  return { userId: state().userId || null };
}

// Runs the app's handler the way Clerk's wrapper does, minus the auth work, so
// middleware.js can be exercised on its own. `undefined` from the handler
// means "carry on", which Clerk turns into NextResponse.next().
export function clerkMiddleware(handler) {
  return async (request, event) => {
    const { NextResponse } = await import("next/server");
    return (await handler(auth, request, event)) || NextResponse.next();
  };
}

// Accounts a test can define, as { userId: { fullName, emails: [{ address, verified }] } }. With none defined
// the stand-in answers for any id, as it always did; with some defined, an id that is not among them is not found.
const asUser = (id, def) => ({
  id,
  fullName: def.fullName || "",
  username: def.username || null,
  primaryEmailAddress: def.emails?.length ? { emailAddress: def.emails[0].address } : null,
  emailAddresses: (def.emails || []).map((e) => ({ emailAddress: e.address, verification: { status: e.verified === false ? "unverified" : "verified" } })),
  publicMetadata: { role: state().roles?.[id] || "user" }
});

export const clerkClient = async () => ({
  users: {
    getUser: async (userId) => {
      const defined = state().clerkUsers;
      if (defined && defined[userId]) return asUser(userId, defined[userId]);
      // With accounts defined, an id that is neither one of them nor someone acting in the test is not found.
      if (defined && userId !== state().userId && !state().roles?.[userId]) throw Object.assign(new Error("Not Found"), { status: 404 });
      return { id: userId, publicMetadata: { role: state().roles?.[userId] || "user" } };
    },
    // Changing an account's role, as the role routes do: it merges into what the account already carries, and the next
    // lookup (getUser, or a role check) sees it. `metadataWrites` records each call so a test can see what was sent.
    updateUserMetadata: async (userId, { publicMetadata = {} } = {}) => {
      if (state().clerkDown) throw new Error("Clerk is down");
      const s = state();
      s.metadataWrites = [...(s.metadataWrites || []), { userId, publicMetadata }];
      if (publicMetadata.role) s.roles = { ...(s.roles || {}), [userId]: publicMetadata.role };
      return { id: userId, publicMetadata };
    },
    getUserList: async ({ emailAddress = [] } = {}) => {
      if (state().clerkDown) throw new Error("Clerk is down");
      const wanted = emailAddress.map((e) => String(e).toLowerCase());
      const data = Object.entries(state().clerkUsers || {})
        .filter(([, def]) => (def.emails || []).some((e) => wanted.includes(e.address.toLowerCase())))
        .map(([id, def]) => asUser(id, def));
      return { data, totalCount: data.length };
    }
  }
});
