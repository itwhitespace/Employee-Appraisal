import { isEmployee } from "@/lib/evaluation";
import { compensationOverview } from "@/lib/server/compensation";
import {
  createUser,
  listLevels,
  listUsers,
  logCompensation,
  saveSalaries,
  updateEmployeeProfile,
} from "@/lib/server/db";
import { handle, HttpError, readJson, requireCompensationUser } from "@/lib/server/http";
import { parseEmployeeInput, parseSalaryRecord } from "@/lib/server/validate";
import type { EmployeeInput } from "@/lib/types";

export const dynamic = "force-dynamic";

const asObject = (value: unknown) =>
  (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
const asList = (value: unknown) => (Array.isArray(value) ? value : []);
const text = (value: unknown, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * Saves what the user confirmed on the import page, in this order: people new to the system
 * (supervisors before the people who report to them), job titles and teams, then salaries,
 * all salaries with the same date. Everything is checked before anything is written.
 *
 * Body: {
 *   effectiveDate, note,
 *   newEmployees: [{ code, name, nickname, role, departmentId, level, supervisorCode, position, team,
 *                    startDate, levelSince, appraisalType }],
 *   profileUpdates: [{ employeeId, position?, team? }],
 *   items: [{ employeeId | newCode, baseSalary, allowance }],
 * }
 * New people are employees or supervisors only, never admin, never with compensation access,
 * and have no password: they cannot sign in until admin sets one.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireCompensationUser();
    const body = await readJson(request);
    const [users, levels] = await Promise.all([listUsers(), listLevels()]);
    const byCode = new Map(users.map((u) => [u.code, u]));

    // ---- people new to the system
    const rawNew = asList(body.newEmployees).slice(0, 500).map(asObject);
    const newCodes = new Set<string>();
    const drafts = rawNew.map((raw) => {
      const role = raw.role === "supervisor" ? "supervisor" : raw.role === "employee" ? "employee" : null;
      if (!role) throw new HttpError(400, "นำเข้าได้เฉพาะสิทธิ์พนักงานหรือหัวหน้า");
      const input = parseEmployeeInput({ ...raw, role, supervisorId: null });
      if (byCode.has(input.code)) throw new HttpError(409, `รหัสพนักงาน ${input.code} มีอยู่ในระบบแล้ว`);
      if (newCodes.has(input.code)) throw new HttpError(400, `รหัส ${input.code} ซ้ำกันในไฟล์`);
      newCodes.add(input.code);
      if (!input.departmentId || !input.level)
        throw new HttpError(400, `${input.name}: กรุณาระบุฝ่ายและ Level`);
      if (!levels.some((l) => l.departmentId === input.departmentId && l.level === input.level)) {
        throw new HttpError(400, `${input.name}: ไม่พบ Level นี้ในฝ่ายที่ระบุ`);
      }
      const supervisorCode = text(raw.supervisorCode, 5);
      if (!byCode.has(supervisorCode) && !rawNew.some((other) => text(other.code, 5) === supervisorCode)) {
        throw new HttpError(400, `${input.name}: ไม่พบหัวหน้ารหัส ${supervisorCode || "–"}`);
      }
      return { input, supervisorCode };
    });

    // ---- job titles and teams of people already in the system
    const updates = asList(body.profileUpdates)
      .slice(0, 1000)
      .map(asObject)
      .map((raw) => {
        const employee = users.find((u) => u.id === raw.employeeId);
        if (!employee) throw new HttpError(400, "มีพนักงานที่ไม่พบในระบบ กรุณาโหลดหน้าใหม่");
        const profile: { position?: string; team?: string } = {};
        if (typeof raw.position === "string") profile.position = text(raw.position);
        if (typeof raw.team === "string") profile.team = text(raw.team);
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
        if (newCode ? !newCodes.has(newCode) : !users.some((u) => u.id === employeeId && isEmployee(u))) {
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
    const created = new Map<string, string>();
    const idOf = (code: string) => created.get(code) ?? byCode.get(code)?.id ?? null;
    let pending = drafts;
    while (pending.length) {
      const ready = pending.filter((d) => idOf(d.supervisorCode));
      if (ready.length === 0)
        throw new HttpError(400, "หัวหน้าของพนักงานใหม่อ้างถึงกันเป็นวง กรุณาตรวจคอลัมน์หัวหน้า");
      for (const draft of ready) {
        const input: EmployeeInput = { ...draft.input, supervisorId: idOf(draft.supervisorCode) };
        created.set(input.code, (await createUser(input, null)).id);
      }
      pending = pending.filter((d) => !ready.includes(d));
    }
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
        `แก้ตำแหน่ง/ทีมจาก Excel เมนู ฐานเงินเดือนพนักงาน >>> ${updates.map((u) => u.employee.name).join(", ")}`,
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
