import { getSalaryStructure, listLevels, logCompensation, saveSalaryStructure } from "@/lib/server/db";
import { handle, readJson, requireCompensationUser } from "@/lib/server/http";
import { parseSalaryStructure } from "@/lib/server/validate";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

/** The salary structure and the levels it can pay. */
export async function GET() {
  return handle(async () => {
    const user = await requireCompensationUser();
    await logCompensation(user.id, "เปิดดูเมนู โครงสร้างเงินเดือน");
    const [structure, levels] = await Promise.all([getSalaryStructure(), listLevels()]);
    return { structure, levels };
  });
}

/** Replaces the whole structure. Body: { grades }. */
export async function PUT(request: Request) {
  return handle(async () => {
    const user = await requireCompensationUser();
    const structure = await saveSalaryStructure(parseSalaryStructure(await readJson(request)));
    await logCompensation(user.id, "บันทึก เมนู โครงสร้างเงินเดือน");
    return { structure };
  });
}
