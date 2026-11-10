// Where the top bar's "Sign in" goes. It used to be plain /sign-in, so reading a discussion, signing in and landing on
// the home page lost your place (found in testing, check J11). Now it carries the page you are on, so signing in
// brings you back to it. Only a path on this site is ever passed on: anything else gives the plain sign-in page.
export function signInUrl(pathname) {
  const path = typeof pathname === "string" ? pathname : "";
  const sameSitePath = path.startsWith("/") && !path.startsWith("//") && !/[\\\s]|:\/\//.test(path) && path.length <= 300;
  const onAuthPage = path === "/sign-in" || path.startsWith("/sign-in/") || path === "/sign-up" || path.startsWith("/sign-up/");
  if (!sameSitePath || path === "/" || onAuthPage) return "/sign-in";
  return `/sign-in?redirect_url=${encodeURIComponent(path)}`;
}
