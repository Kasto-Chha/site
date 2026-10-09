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

export const clerkClient = async () => ({
  users: {
    getUser: async (userId) => ({
      id: userId,
      publicMetadata: { role: state().roles?.[userId] || "user" }
    })
  }
});
