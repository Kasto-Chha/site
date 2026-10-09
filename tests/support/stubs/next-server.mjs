// Plain node can't resolve the extensionless "next/server" specifier that Next
// itself handles. This hands tests the *real* NextResponse (not a copy of it)
// via the explicit file path, so route code that returns NextResponse runs as it
// does in production.
import nextServer from "next/server.js";

export const NextResponse = nextServer.NextResponse;
export const NextRequest = nextServer.NextRequest;
