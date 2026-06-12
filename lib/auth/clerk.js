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
