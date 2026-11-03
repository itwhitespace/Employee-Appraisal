import { compensationOverview } from "@/lib/server/compensation";
import { getMeritPlan, logCompensation, saveMeritPlan, payTablesOf, type PayTables } from "@/lib/server/db";
import { handle, readJson, requireCompensationUser } from "@/lib/server/http";
import { parseMeritPlan } from "@/lib/server/validate";
import type { MeritData } from "@/lib/types";

export const dynamic = "force-dynamic";

async function meritData(pay: PayTables): Promise<MeritData> {
  const overview = await compensationOverview(pay);
  const saved = await getMeritPlan(pay, overview.cycleId);
  return { overview, plan: saved?.plan ?? null, updatedAt: saved?.updatedAt ?? null };
}

/** Everyone's pay and Performance Score, with the current cycle's saved plan. */
export async function GET() {
  return handle(async () => {
    const user = await requireCompensationUser();
    const pay = payTablesOf(user);
    await logCompensation(pay, user.id, "เปิดดูเมนู ปรับเงินเดือนประจำปี");
    return meritData(pay);
  });
}

/** Saves the current cycle's plan. Body: a MeritPlan. */
export async function PUT(request: Request) {
  return handle(async () => {
    const user = await requireCompensationUser();
    const pay = payTablesOf(user);
    const plan = parseMeritPlan(await readJson(request));
    const { cycleId } = (await meritData(pay)).overview;
    await saveMeritPlan(pay, cycleId, plan, user.id);
    const budget =
      plan.budgetAmount !== null ? `${plan.budgetAmount.toLocaleString()} บาท` : `${plan.targetPercent}%`;
    await logCompensation(pay, user.id, `บันทึกแผน เมนู ปรับเงินเดือนประจำปี ${cycleId} (งบ ${budget})`);
    return meritData(pay);
  });
}
