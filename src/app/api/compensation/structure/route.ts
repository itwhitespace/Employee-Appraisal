import {
  getSalaryStructure,
  listCompensationAudit,
  listLevels,
  logCompensation,
  saveSalaryStructure,
} from "@/lib/server/db";
import { handle, readJson, requireCompensationUser } from "@/lib/server/http";
import { parseSalaryStructure } from "@/lib/server/validate";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

/** The salary structure, the levels it can pay, and the recent access record. */
export async function GET() {
  return handle(async () => {
    const user = await requireCompensationUser();
    await logCompensation(user.id, "เปิดดูโครงสร้างเงินเดือน");
    const [structure, levels, audit] = await Promise.all([
      getSalaryStructure(),
      listLevels(),
      listCompensationAudit(),
    ]);
    return { structure, levels, audit };
  });
}

/** Replaces the whole structure. Body: { grades }. */
export async function PUT(request: Request) {
  return handle(async () => {
    const user = await requireCompensationUser();
    const structure = await saveSalaryStructure(parseSalaryStructure(await readJson(request)));
    await logCompensation(user.id, "บันทึกโครงสร้างเงินเดือน");
    return { structure, audit: await listCompensationAudit() };
  });
}
