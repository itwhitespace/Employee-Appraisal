import { listLevels, listUsers } from "@/lib/server/db";
import {
  applyEmployeeUpdates,
  checkEmployeeUpdates,
  checkNewEmployees,
  createNewEmployees,
} from "@/lib/server/employee-import";
import { handle, HttpError, readJson, requireUser } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * The employee import of admin: people new to the system and changes to people already in it,
 * from the employee workbook. No pay is read or written here.
 * Body: { newEmployees: ImportedEmployee[], updates: [{ employeeId, changes }] }.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireUser(["admin"]);
    const body = await readJson(request);
    const [users, levels] = await Promise.all([listUsers(), listLevels()]);
    const drafts = checkNewEmployees(body.newEmployees, users, levels);
    const newCodes = new Set(drafts.map((d) => d.input.code));
    const { updates, supervisorCodes } = checkEmployeeUpdates(body.updates, users, newCodes);
    if (drafts.length + updates.length === 0) throw new HttpError(400, "ยังไม่ได้เลือกรายการที่จะนำเข้า");

    const created = await createNewEmployees(drafts, users);
    await applyEmployeeUpdates(updates, supervisorCodes, created);
    return { created: created.size, updated: updates.length };
  });
}
