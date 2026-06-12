import { clerkMiddleware } from "@clerk/nextjs/server";

export default async function middleware(request, event) {
  // Run Clerk middleware to handle auth context and route protections
  const clerkHandler = clerkMiddleware();
  return await clerkHandler(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|.*\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|map)).*)",
    "/(api|trpc)(.*)"
  ]
};
