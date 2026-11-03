import { compensationOverview } from "@/lib/server/compensation";
import { getBonusPlan, logCompensation, saveBonusPlan, payTablesOf, type PayTables } from "@/lib/server/db";
import { handle, readJson, requireCompensationUser } from "@/lib/server/http";
import { parseBonusPlan } from "@/lib/server/validate";
import type { BonusData } from "@/lib/types";

export const dynamic = "force-dynamic";

async function bonusData(pay: PayTables): Promise<BonusData> {
  const overview = await compensationOverview(pay);
  const saved = await getBonusPlan(pay, overview.cycleId);
  return { overview, plan: saved?.plan ?? null, updatedAt: saved?.updatedAt ?? null };
}

/** Everyone's pay with Performance and Potential Scores, and the current cycle's saved plan. */
export async function GET() {
  return handle(async () => {
    const user = await requireCompensationUser();
    const pay = payTablesOf(user);
    await logCompensation(pay, user.id, "เปิดดูเมนู โบนัสประจำปี");
    return bonusData(pay);
  });
}

/** Saves the current cycle's plan. Body: a BonusPlan. */
export async function PUT(request: Request) {
  return handle(async () => {
    const user = await requireCompensationUser();
    const pay = payTablesOf(user);
    const plan = parseBonusPlan(await readJson(request));
    const { cycleId } = (await bonusData(pay)).overview;
    await saveBonusPlan(pay, cycleId, plan, user.id);
    await logCompensation(
      pay,
      user.id,
      `บันทึกแผน เมนู โบนัสประจำปี ${cycleId} (งบ ${(plan.budget ?? 0).toLocaleString()} บาท)`,
    );
    return bonusData(pay);
  });
}
