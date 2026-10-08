import { handle } from "@/lib/server/http";
import { endSession } from "@/lib/server/session";

export async function POST() {
  return handle(async () => {
    endSession();
    return { ok: true };
  });
}
