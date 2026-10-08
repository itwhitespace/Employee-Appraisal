import { resolveCycle } from "@/lib/server/cycles";
import { handle } from "@/lib/server/http";
import { getSessionUser } from "@/lib/server/session";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

/** The signed-in user and the open cycle, or `{ user: null }` when there is no valid session. */
export async function GET() {
  return handle(async () => {
    const user = await getSessionUser();
    if (!user) return { user: null, cycle: null };
    // The cycle is only a label in the sidebar; never block sign-in on it.
    const cycle = await resolveCycle()
      .then((result) => result.cycle)
      .catch(() => null);
    return { user, cycle };
  });
}
