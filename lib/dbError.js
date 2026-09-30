// Failed database calls: the full error goes to the server log, the client gets
// a message we chose.
//
// Postgres and PostgREST errors name tables, columns and constraints, and
// sometimes echo the offending value ("Key (slug)=(...) already exists"). That
// is for our logs, not for whoever sent the request.

export function logDbError(context, error) {
  console.error(`${context}:`, error?.code || "-", error?.message || error);
}

// The few failures an admin can act on get a plain explanation; everything
// else is generic.
const ADMIN_MESSAGES = {
  "23505": "Another entry already uses that URL slug. Choose a different one.",
  "23514": "One of the values is outside what is allowed.",
  "22001": "One of the values is too long.",
  "22P02": "One of the values has the wrong format."
};

export function adminSaveMessage(error) {
  return ADMIN_MESSAGES[error?.code] || "Could not save. Please try again.";
}
