import { handle } from "@/lib/server/http";
import { getSessionUser } from "@/lib/server/session";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

/** The signed-in user, or `{ user: null }` when there is no valid session. */
export async function GET() {
  return handle(async () => ({ user: await getSessionUser() }));
}
