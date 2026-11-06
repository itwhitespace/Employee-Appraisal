import { searchHoldings } from "@/lib/server/devices";
import { handle, requireUser } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** `?q=`: every holder-history line of a person (name, nickname or code), with the computer. */
export async function GET(request: Request) {
  return handle(async () => {
    await requireUser(["admin"]);
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return { matches: await searchHoldings(q.slice(0, 60)) };
  });
}
