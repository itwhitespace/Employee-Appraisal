import "server-only";
import { fiscalMonths, type HardwareLine } from "../software";
import { HttpError } from "./errors";
import { db } from "./supabase";

/** Hardware lines of the IT budget, per fiscal year (table it_budget_hardware). */

interface HardwareRow {
  id: string;
  item: string;
  detail: string;
  amounts: Record<string, number> | null;
}

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function listHardware(year: number): Promise<HardwareLine[]> {
  const rows = check(
    await db()
      .from("it_budget_hardware")
      .select("id, item, detail, amounts")
      .eq("fiscal_year", year)
      .order("position"),
  ) as HardwareRow[];
  return rows.map((row) => ({ id: row.id, item: row.item, detail: row.detail, amounts: row.amounts ?? {} }));
}

/** The year's lines as typed on the dashboard: each line's months must be months of that year. */
export function parseHardware(value: unknown, year: number): Omit<HardwareLine, "id">[] {
  const months = new Set(fiscalMonths(year));
  const list = Array.isArray(value) ? value.slice(0, 200) : [];
  return list.map((raw, i) => {
    const line = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const item = typeof line.item === "string" ? line.item.trim().slice(0, 120) : "";
    if (!item) throw new HttpError(400, `แถวที่ ${i + 1}: กรุณากรอกชื่อรายการ`);
    const amounts: Record<string, number> = {};
    const given =
      line.amounts && typeof line.amounts === "object" ? (line.amounts as Record<string, unknown>) : {};
    for (const [month, amount] of Object.entries(given)) {
      if (!months.has(month) || amount === null || amount === "" || amount === undefined) continue;
      const n = Number(amount);
      if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new HttpError(400, `${item}: จำนวนเงินไม่ถูกต้อง`);
      if (n > 0) amounts[month] = Math.round(n * 100) / 100;
    }
    return { item, detail: typeof line.detail === "string" ? line.detail.trim().slice(0, 200) : "", amounts };
  });
}

/** Replaces the year's hardware lines with these, in this order. */
export async function saveHardware(
  year: number,
  lines: Omit<HardwareLine, "id">[],
  actorId: string,
): Promise<void> {
  check(await db().from("it_budget_hardware").delete().eq("fiscal_year", year));
  if (lines.length === 0) return;
  check(
    await db()
      .from("it_budget_hardware")
      .insert(
        lines.map((line, i) => ({
          fiscal_year: year,
          position: i + 1,
          item: line.item,
          detail: line.detail,
          amounts: line.amounts,
          updated_by: actorId,
        })),
      ),
  );
}
