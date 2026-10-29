import { isEmployee } from "@/lib/evaluation";
import { compensationOverview } from "@/lib/server/compensation";
import { listUsers, logCompensation, saveSalaries } from "@/lib/server/db";
import { handle, HttpError, readJson, requireCompensationUser } from "@/lib/server/http";
import { parseSalaryRecord } from "@/lib/server/validate";

export const dynamic = "force-dynamic";

/**
 * Saves the salaries the user confirmed on the import page, all with the same date.
 * Body: { effectiveDate, note, items: [{ employeeId, baseSalary, allowance }] }.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireCompensationUser();
    const body = await readJson(request);
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) throw new HttpError(400, "ยังไม่ได้เลือกรายการที่จะนำเข้า");
    if (items.length > 1000) throw new HttpError(400, "รายการมากเกินไป");

    const employees = new Map((await listUsers()).filter(isEmployee).map((e) => [e.id, e]));
    const seen = new Set<string>();
    const entries = items.map((item) => {
      const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const employeeId = typeof raw.employeeId === "string" ? raw.employeeId : "";
      const employee = employees.get(employeeId);
      if (!employee) throw new HttpError(400, "มีพนักงานที่ไม่พบในระบบ กรุณาโหลดหน้าใหม่");
      if (seen.has(employeeId)) throw new HttpError(400, `${employee.name} ถูกเลือกมากกว่าหนึ่งแถว`);
      seen.add(employeeId);
      const record = parseSalaryRecord({
        effectiveDate: body.effectiveDate,
        note: body.note,
        baseSalary: raw.baseSalary,
        allowance: raw.allowance,
      });
      return { employeeId, record };
    });

    await saveSalaries(entries, user.id);
    await logCompensation(
      user.id,
      `นำเข้าเงินเดือนจาก Excel ${entries.length} คน มีผล ${entries[0].record.effectiveDate}`,
    );
    return compensationOverview();
  });
}
