import { roundUp, rowMultiplier, scoreStep } from "./merit";
import type { BonusPlan, CompensationOverview, CompensationRow } from "./types";

/**
 * Bonus Matrix, as in the Bonus sheet of Model.xls: bonus % of annual base salary =
 * anchor × Performance multiplier × Potential multiplier. The pool is the budget the MD sets,
 * and the anchor (Performance 3 × Potential 3) is solved so the suggestions add up to it,
 * which Excel did with Goal Seek. Adjusted amounts replace only their own person's bonus.
 */

export const DEFAULT_BONUS_PLAN: BonusPlan = {
  budget: null,
  // Score 1 … 5, as in the Bonus sheet.
  rowMultipliers: [0.7, 0.8, 1, 1.2, 1.5],
  columnMultipliers: [0.7, 0.8, 1, 1.1, 1.2],
  roundTo: 1000,
  adjustments: {},
};

/** Row captions of the Bonus sheet, Performance 5 … 1 (descriptions only). */
export const PERFORMANCE_CAPTIONS = ["Exceed 120%", "120–101%", "100–91%", "90–80%", "below 70%"];
/** Potential groups of the Bonus sheet, 5 … 1. */
export const POTENTIAL_GROUPS = ["Hight Potential", "Potential", "Neutral", "Need Improvement", "Disengage"];

/** The group of a Potential Score, by its whole score. */
export const potentialGroup = (score: number) =>
  POTENTIAL_GROUPS[5 - Math.min(5, Math.max(1, Math.round(score)))];

export interface BonusLine {
  row: CompensationRow;
  baseSalary: number;
  annualSalary: number;
  performanceStep: number;
  potentialStep: number;
  /** Bonus % ÷ anchor. */
  weight: number;
  /** Bonus % of annual salary from the matrix. */
  suggestedPercent: number;
  /** Bonus Spending: suggestedPercent × annual salary, before rounding. */
  suggested: number;
  /** Set by hand; replaces `suggested`. */
  adjusted: number | null;
  /** RoundUp Bonus: (adjusted ?? suggested) rounded up. */
  amount: number;
  /** amount ÷ monthly base salary: how many months of pay. */
  months: number;
}

export interface BonusResult {
  lines: BonusLine[];
  excluded: { row: CompensationRow; reason: string }[];
  /** Annual base pay of the people taking part. */
  payroll: number;
  budget: number | null;
  anchor: number;
  spend: number;
  gap: number;
}

export function solveBonus(overview: CompensationOverview, plan: BonusPlan): BonusResult {
  const excluded: BonusResult["excluded"] = [];
  const base: Omit<BonusLine, "suggestedPercent" | "suggested" | "adjusted" | "amount" | "months">[] = [];
  for (const row of overview.rows) {
    const skip = (reason: string) => excluded.push({ row, reason });
    if (row.performance === null) skip("ผลประเมินยังไม่อนุมัติ");
    else if (row.potential === null) skip("ไม่มี Potential Score");
    else if (!row.salary) skip("ยังไม่มีเงินเดือน");
    else {
      const performanceStep = scoreStep(row.performance);
      const potentialStep = scoreStep(row.potential);
      base.push({
        row,
        baseSalary: row.salary.baseSalary,
        annualSalary: row.salary.baseSalary * 12,
        performanceStep,
        potentialStep,
        weight:
          rowMultiplier(performanceStep, plan.rowMultipliers) *
          rowMultiplier(potentialStep, plan.columnMultipliers),
      });
    }
  }

  const payroll = base.reduce((sum, line) => sum + line.annualSalary, 0);
  const budget = plan.budget;
  const pool = budget ?? 0;
  const totalWeight = base.reduce((sum, line) => sum + line.annualSalary * line.weight, 0);
  const spendAt = (anchor: number) =>
    base.reduce((sum, line) => sum + roundUp(line.annualSalary * anchor * line.weight, plan.roundTo), 0);
  // Exact without rounding; with rounding up, the largest anchor that still fits the pool.
  let anchor = pool > 0 && totalWeight > 0 ? pool / totalWeight : 0;
  if (plan.roundTo > 0 && anchor > 0) {
    let low = 0;
    let high = anchor;
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      if (spendAt(mid) <= pool) low = mid;
      else high = mid;
    }
    anchor = low;
  }

  const lines = base.map((line): BonusLine => {
    const suggestedPercent = anchor * line.weight;
    const suggested = line.annualSalary * suggestedPercent;
    const adjusted = plan.adjustments[line.row.employee.id] ?? null;
    const amount = roundUp(adjusted ?? suggested, plan.roundTo);
    return { ...line, suggestedPercent, suggested, adjusted, amount, months: amount / line.baseSalary };
  });
  const spend = lines.reduce((sum, line) => sum + line.amount, 0);
  const gap = Math.round((pool - spend) * 100) / 100 || 0;
  return { lines, excluded, payroll, budget, anchor, spend, gap };
}
