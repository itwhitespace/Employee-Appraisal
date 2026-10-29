import { resolveCycle } from "@/lib/server/cycles";
import { listCompensationAudit, logCompensation } from "@/lib/server/db";
import { handle, HttpError, readJson, requireCompensationUser } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Who opened or changed compensation data, newest first. */
export async function GET() {
  return handle(async () => {
    await requireCompensationUser();
    return { audit: await listCompensationAudit(300) };
  });
}

/**
 * Records something done in the browser that the server cannot see, such as a download.
 * Only known events are accepted, so nothing else can be written into the record.
 * Body: { event: "merit-export", rows }.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireCompensationUser();
    const body = await readJson(request);
    if (body.event !== "merit-export") throw new HttpError(400, "ไม่รู้จักรายการนี้");
    const rows = typeof body.rows === "number" && Number.isInteger(body.rows) ? body.rows : 0;
    const { cycle } = await resolveCycle();
    await logCompensation(user.id, `ส่งออก Excel แผนขึ้นเงินเดือน ${cycle.id} (${rows} คน)`);
    return { ok: true };
  });
}
