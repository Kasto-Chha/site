// One rule for "is this address safe to store and show?", shared by the admin's
// url fields and by anything that displays a stored address (e.g. a reel's cover).

// https:// with a real host and no embedded credentials — or, where the field
// allows it, a path on this site. "//evil.com" and "/\evil.com" both look like
// paths but browsers treat them as other hosts, so neither counts as relative.
// Whitespace and control characters are refused outright: they are how a URL
// that validates here gets read differently by a browser.
export function isAllowedUrl(value, { allowRelative = false } = {}) {
  if (/[\s\u0000-\u001f\u007f\\]/.test(value)) return false;
  if (value.startsWith("/")) return allowRelative && !value.startsWith("//");
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
}
