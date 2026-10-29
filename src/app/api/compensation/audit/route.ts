import { resolveCycle } from "@/lib/server/cycles";
import { getUser, listCompensationAudit, logCompensation } from "@/lib/server/db";
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
 * Body: { event: "merit-export" | "bonus-export", rows } or { event: "salary-view", employeeId }.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireCompensationUser();
    const body = await readJson(request);
    if (body.event === "salary-view") {
      const employee = typeof body.employeeId === "string" ? await getUser(body.employeeId) : null;
      if (!employee) throw new HttpError(404, "ไม่พบพนักงานคนนี้");
      await logCompensation(user.id, `เปิดดูเมนู ฐานเงินเดือนพนักงาน >>> ${employee.name}`);
      return { ok: true };
    }
    if (body.event !== "merit-export" && body.event !== "bonus-export") {
      throw new HttpError(400, "ไม่รู้จักรายการนี้");
    }
    const rows = typeof body.rows === "number" && Number.isInteger(body.rows) ? body.rows : 0;
    const { cycle } = await resolveCycle();
    const menu = body.event === "bonus-export" ? "โบนัสประจำปี" : "ปรับเงินเดือนประจำปี";
    await logCompensation(user.id, `ส่งออก Excel เมนู ${menu} ${cycle.id} (${rows} คน)`);
    return { ok: true };
  });
}
