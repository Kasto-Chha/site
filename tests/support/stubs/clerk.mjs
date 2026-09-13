// Stands in for @clerk/nextjs/server. The test drives who is signed in, and
// what role they carry, through globalThis.__KC_TEST__.

function state() {
  return globalThis.__KC_TEST__;
}

export async function auth() {
  return { userId: state().userId || null };
}

export const clerkClient = async () => ({
  users: {
    getUser: async (userId) => ({
      id: userId,
      publicMetadata: { role: state().roles?.[userId] || "user" }
    })
  }
});
