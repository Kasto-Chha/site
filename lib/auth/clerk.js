import { clerkClient } from "@clerk/nextjs/server";

export async function getClerkClient() {
  // Clerk v6 can expose clerkClient as an async factory in server runtimes.
  if (typeof clerkClient === "function") {
    return clerkClient();
  }
  return clerkClient;
}

export async function getClerkUser(userId) {
  if (!userId) return null;
  const client = await getClerkClient();
  return client.users.getUser(userId);
}

export function getPreferredUserName(user, fallback = "Anonymous") {
  return (
    user?.fullName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress ||
    fallback
  );
}

// Accounts that have this email. An email belongs to at most one account, so this is zero or one.
export async function findClerkUsersByEmail(email) {
  const client = await getClerkClient();
  const result = await client.users.getUserList({ emailAddress: [email], limit: 2 });
  return Array.isArray(result) ? result : result?.data || [];
}

// What the team needs to see to be sure it is the right person, and nothing more: the account's id, a name, an
// email, and whether that email has been verified (that its owner has proved they control it).
export function describeClerkUser(user) {
  const addresses = user?.emailAddresses || [];
  const primary = user?.primaryEmailAddress?.emailAddress || addresses[0]?.emailAddress || "";
  return {
    id: user.id,
    name: getPreferredUserName(user, "(no name)"),
    email: primary,
    verified: addresses.some((a) => a?.verification?.status === "verified")
  };
}
