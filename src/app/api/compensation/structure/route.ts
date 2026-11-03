import {
  getSalaryStructure,
  listLevels,
  logCompensation,
  saveSalaryStructure,
  payTablesOf,
} from "@/lib/server/db";
import { handle, HttpError, readJson, requireCompensationUser } from "@/lib/server/http";
import { parseSalaryStructure } from "@/lib/server/validate";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

/** The salary structure and the levels it can pay. */
export async function GET() {
  return handle(async () => {
    const user = await requireCompensationUser();
    const pay = payTablesOf(user);
    await logCompensation(pay, user.id, "เปิดดูเมนู โครงสร้างเงินเดือน");
    const [structure, levels] = await Promise.all([getSalaryStructure(), listLevels()]);
    return { structure, levels };
  });
}

/** Replaces the whole structure. Body: { grades }. */
export async function PUT(request: Request) {
  return handle(async () => {
    const user = await requireCompensationUser();
    const pay = payTablesOf(user);
    if (pay.sandbox) throw new HttpError(403, "โหมดทดสอบ: บันทึกไม่ได้ (ข้อมูลจริงใช้ร่วมกับ MD)");
    const structure = await saveSalaryStructure(parseSalaryStructure(await readJson(request)));
    await logCompensation(pay, user.id, "บันทึก เมนู โครงสร้างเงินเดือน");
    return { structure };
  });
}
