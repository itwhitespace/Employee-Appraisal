import { listCompensationAudit } from "@/lib/server/db";
import { handle, requireCompensationUser } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Who opened or changed compensation data, newest first. */
export async function GET() {
  return handle(async () => {
    await requireCompensationUser();
    return { audit: await listCompensationAudit(300) };
  });
}
