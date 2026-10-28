import { isEmployee } from "@/lib/evaluation";
import { compensationOverview } from "@/lib/server/compensation";
import { getUser, logCompensation, saveSalary } from "@/lib/server/db";
import { handle, HttpError, readJson, requireCompensationUser } from "@/lib/server/http";
import { parseSalaryRecord } from "@/lib/server/validate";

export const dynamic = "force-dynamic";

interface Context {
  params: { employeeId: string };
}

/** Adds a salary record (or corrects the one on the same date). Body: a SalaryRecord. */
export async function PUT(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await requireCompensationUser();
    const employee = await getUser(params.employeeId);
    if (!employee || !isEmployee(employee)) throw new HttpError(404, "ไม่พบพนักงานคนนี้");
    const record = parseSalaryRecord(await readJson(request));
    await saveSalary(employee.id, record, user.id);
    await logCompensation(user.id, `บันทึกเงินเดือน ${employee.code} มีผล ${record.effectiveDate}`);
    return compensationOverview();
  });
}
