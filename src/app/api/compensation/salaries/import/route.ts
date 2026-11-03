import { onPayScale } from "@/lib/evaluation";
import { compensationOverview } from "@/lib/server/compensation";
import { listLevels, listUsers, logCompensation, saveSalaries, updateEmployeeProfile } from "@/lib/server/db";
import { asList, asObject, checkNewEmployees, createNewEmployees, text } from "@/lib/server/employee-import";
import { handle, HttpError, readJson, requireCompensationUser } from "@/lib/server/http";
import { parseSalaryRecord } from "@/lib/server/validate";

export const dynamic = "force-dynamic";

/**
 * Saves what the user confirmed on the import page, in this order: people new to the system
 * (supervisors before the people who report to them), job titles and teams, then salaries,
 * all salaries with the same date. Everything is checked before anything is written.
 *
 * Body: {
 *   effectiveDate, note,
 *   newEmployees: [{ code, name, nickname, role, departmentId, level, supervisorCode, position, team,
 *                    startDate, levelSince, birthDate, appraisalType, password }],
 *   profileUpdates: [{ employeeId, position?, team?, birthDate? }],
 *   items: [{ employeeId | newCode, baseSalary, allowance }],
 * }
 * New people may have any role and a password (last five digits of the national ID), never
 * compensation access: that is granted only in the database.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireCompensationUser();
    const body = await readJson(request);
    const [users, levels] = await Promise.all([listUsers(), listLevels()]);

    // ---- people new to the system
    const drafts = checkNewEmployees(body.newEmployees, users, levels);
    const newCodes = new Set(drafts.map((d) => d.input.code));

    // ---- job titles and teams of people already in the system
    const updates = asList(body.profileUpdates)
      .slice(0, 1000)
      .map(asObject)
      .map((raw) => {
        const employee = users.find((u) => u.id === raw.employeeId);
        if (!employee) throw new HttpError(400, "มีพนักงานที่ไม่พบในระบบ กรุณาโหลดหน้าใหม่");
        const profile: { position?: string; team?: string; birthDate?: string } = {};
        if (typeof raw.position === "string") profile.position = text(raw.position);
        if (typeof raw.team === "string") profile.team = text(raw.team);
        if (typeof raw.birthDate === "string") {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.birthDate) || Number.isNaN(Date.parse(raw.birthDate))) {
            throw new HttpError(400, `${employee.name}: วันเกิดไม่ถูกต้อง`);
          }
          profile.birthDate = raw.birthDate;
        }
        return { employee, profile };
      });

    // ---- salaries (checked before anything is written)
    const seen = new Set<string>();
    const salaryItems = asList(body.items)
      .slice(0, 1000)
      .map(asObject)
      .map((raw) => {
        const newCode = text(raw.newCode, 5);
        const employeeId = typeof raw.employeeId === "string" ? raw.employeeId : "";
        const key = newCode ? `new:${newCode}` : employeeId;
        if (newCode ? !newCodes.has(newCode) : !users.some((u) => u.id === employeeId && onPayScale(u))) {
          throw new HttpError(400, "มีพนักงานที่ไม่พบในระบบ กรุณาโหลดหน้าใหม่");
        }
        if (seen.has(key)) throw new HttpError(400, "มีพนักงานคนเดียวกันถูกเลือกมากกว่าหนึ่งแถว");
        seen.add(key);
        const record = parseSalaryRecord({
          effectiveDate: body.effectiveDate,
          note: body.note,
          baseSalary: raw.baseSalary,
          allowance: raw.allowance,
        });
        return { newCode, employeeId, record };
      });
    if (drafts.length + updates.length + salaryItems.length === 0) {
      throw new HttpError(400, "ยังไม่ได้เลือกรายการที่จะนำเข้า");
    }

    // ---- write: new people, supervisors first
    const created = await createNewEmployees(drafts, users);
    if (drafts.length) {
      await logCompensation(
        user.id,
        `เพิ่มพนักงานใหม่จาก Excel เมนู ฐานเงินเดือนพนักงาน >>> ${drafts.map((d) => `${d.input.name} (${d.input.code})`).join(", ")}`,
      );
    }

    for (const { employee, profile } of updates) await updateEmployeeProfile(employee.id, profile);
    if (updates.length) {
      await logCompensation(
        user.id,
        `แก้ตำแหน่ง/ทีม/วันเกิดจาก Excel เมนู ฐานเงินเดือนพนักงาน >>> ${updates.map((u) => u.employee.name).join(", ")}`,
      );
    }

    if (salaryItems.length) {
      await saveSalaries(
        salaryItems.map((item) => ({
          employeeId: item.newCode ? created.get(item.newCode)! : item.employeeId,
          record: item.record,
        })),
        user.id,
      );
      await logCompensation(
        user.id,
        `นำเข้า Excel เมนู ฐานเงินเดือนพนักงาน ${salaryItems.length} คน (มีผล ${salaryItems[0].record.effectiveDate})`,
      );
    }
    return compensationOverview();
  });
}
