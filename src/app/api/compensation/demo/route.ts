import { onPayScale } from "@/lib/evaluation";
import { compensationOverview, todayInThailand } from "@/lib/server/compensation";
import {
  clearDemoSalaries,
  getSalaryStructure,
  listLevels,
  listUsers,
  logCompensation,
  payTablesOf,
  saveSalaries,
} from "@/lib/server/db";
import { handle, HttpError, requireCompensationUser } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const ALLOWANCES = [0, 0, 0, 500, 1000, 1500, 2000, 3000];
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/**
 * Sandbox only: draws new made-up salaries for everyone with a salary grade, somewhere in their
 * grade's range (rounded to the hundred), and replaces the previous made-up ones.
 */
export async function POST() {
  return handle(async () => {
    const user = await requireCompensationUser();
    const pay = payTablesOf(user);
    if (!pay.sandbox) throw new HttpError(403, "ใช้ได้เฉพาะโหมดทดสอบ");

    const [users, levels, structure] = await Promise.all([listUsers(), listLevels(), getSalaryStructure()]);
    const effectiveDate = `${todayInThailand().slice(0, 4)}-01-01`;
    const entries = users.filter(onPayScale).flatMap((person) => {
      const levelName = levels.find(
        (l) => l.departmentId === person.departmentId && l.level === person.level,
      )?.name;
      const grade = structure.grades.find((g) => g.levelName === levelName);
      if (!grade) return [];
      const base = Math.round((grade.min + Math.random() * (grade.max - grade.min)) / 100) * 100;
      return [
        {
          employeeId: person.id,
          record: {
            effectiveDate,
            baseSalary: Math.max(100, base),
            allowance: pick(ALLOWANCES),
            note: "สุ่ม (ทดสอบ)",
          },
        },
      ];
    });

    await clearDemoSalaries(pay);
    await saveSalaries(pay, entries, user.id);
    await logCompensation(pay, user.id, `สุ่มเงินเดือนสมมุติ ${entries.length} คน (โหมดทดสอบ)`);
    return compensationOverview(pay);
  });
}
