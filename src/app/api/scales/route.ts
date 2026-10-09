import { getScales, saveScales } from "@/lib/server/db";
import { handle, readJson, requireUser } from "@/lib/server/http";
import { parseScales } from "@/lib/server/validate";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireUser(["admin"]);
    return { scales: await getScales() };
  });
}

/** Replaces all four scale tables. Body: the scales. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireUser(["admin"]);
    return { scales: await saveScales(parseScales(await readJson(request))) };
  });
}
