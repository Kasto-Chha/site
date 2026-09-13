// Stands in for next/headers. Only cookies().get() is used by the chat route
// (via lib/chatTrial.js), and it reads whatever the test set for this request.

export function cookies() {
  return {
    get(name) {
      const value = globalThis.__KC_TEST__.cookies?.[name];
      return value === undefined ? undefined : { name, value };
    }
  };
}
