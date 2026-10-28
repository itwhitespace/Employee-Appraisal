import { compaGroup, compaRatio } from "./compensation";
import type { CompensationOverview, CompensationRow, MeritPlan, SalaryGrade } from "./types";

/**
 * Merit Increase Matrix, as in Model.xls: raise % = anchor × Competency multiplier ×
 * Compa-ratio multiplier. The anchor (the 90–110%, Competency 3 cell) is solved so the raises
 * add up to the budget, which Excel did with Goal Seek.
 */

/** No budget: it has to be entered and saved before the matrix is worked out. */
export const DEFAULT_MERIT_PLAN: MeritPlan = {
  targetPercent: null,
  budgetAmount: null,
  rowMultipliers: [0.6, 0.8, 1, 1.2, 1.5],
  columnMultipliers: [1.5, 1.2, 1, 0.8, 0.6],
  roundTo: 0,
  minTenureMonths: 3,
  overrides: {},
};

export const TARGET_PRESETS = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

/** Matrix rows: every 0.1 from 5.0 down to 1.0. */
export const SCORE_STEPS = Array.from({ length: 41 }, (_, i) => (50 - i) / 10);

/** The Performance Score's matrix row: 2 decimals as shown, then 1 (3.45 → 3.5, 3.44 → 3.4). */
export function scoreStep(score: number): number {
  const shown = Math.round(score * 100);
  return Math.min(5, Math.max(1, Math.round(shown / 10) / 10));
}

/** The Competency multiplier of a 0.1 step, on the straight line between whole scores. */
export function rowMultiplier(step: number, multipliers: number[]): number {
  const at = Math.min(5, Math.max(1, step)) - 1;
  const low = Math.floor(at);
  const high = Math.min(4, low + 1);
  return multipliers[low] + (multipliers[high] - multipliers[low]) * (at - low);
}

export interface MeritLine {
  row: CompensationRow;
  grade: SalaryGrade;
  baseSalary: number;
  ratio: number;
  group: number;
  step: number;
  /** Raise % ÷ anchor. */
  weight: number;
  /** The matrix's raise in baht, before rounding: anchor × weight × base salary. */
  suggested: number;
  /** suggested ÷ base salary. */
  suggestedPercent: number;
  /** Monthly raise in baht actually given: `suggested` rounded up, or the amount set by hand. */
  amount: number;
  /** amount ÷ base salary. */
  percent: number;
  overridden: boolean;
  newSalary: number;
  newRatio: number;
  overMax: boolean;
}

export interface MeritResult {
  lines: MeritLine[];
  excluded: { row: CompensationRow; reason: string }[];
  /** Monthly base pay of the people taking part, before the raise. */
  payroll: number;
  /** Monthly budget in baht; null when the plan has none. */
  budget: number | null;
  /** budget ÷ payroll. */
  budgetRatio: number | null;
  anchor: number;
  spend: number;
  /** budget − spend; a little above 0 when raises are rounded up. */
  gap: number;
}

/** Whole months from `start` to `today` (both yyyy-mm-dd). */
export function monthsBetween(start: string, today: string): number {
  const [y1, m1, d1] = start.split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/** Monthly budget in baht: the amount typed in, or the percentage of `payroll`. */
export function budgetOf(plan: MeritPlan, payroll: number): number | null {
  if (plan.budgetAmount !== null) return plan.budgetAmount;
  if (plan.targetPercent !== null) return Math.round((payroll * plan.targetPercent) / 100);
  return null;
}

const roundUp = (value: number, to: number) => (to > 0 ? Math.ceil(value / to - 1e-9) * to : value);

/** Raises of everyone taking part, sharing the budget left after the amounts set by hand. */
export function solveMerit(overview: CompensationOverview, plan: MeritPlan, today: string): MeritResult {
  const excluded: MeritResult["excluded"] = [];
  const base: Pick<MeritLine, "row" | "grade" | "baseSalary" | "ratio" | "group" | "step" | "weight">[] = [];
  for (const row of overview.rows) {
    const grade = overview.structure.grades.find((g) => g.grade === row.grade);
    const ratio = compaRatio(row.salary, grade);
    const start = row.employee.startDate;
    const skip = (reason: string) => excluded.push({ row, reason });
    if (row.performance === null) skip("ผลประเมินยังไม่อนุมัติ");
    else if (!row.salary) skip("ยังไม่มีเงินเดือน");
    else if (!grade || ratio === null) skip("Level นี้ยังไม่มีกระบอกเงินเดือน");
    else if (start && monthsBetween(start, today) < plan.minTenureMonths) {
      skip(`อายุงานไม่ถึง ${plan.minTenureMonths} เดือน`);
    } else {
      const group = compaGroup(ratio);
      const step = scoreStep(row.performance);
      base.push({
        row,
        grade,
        baseSalary: row.salary.baseSalary,
        ratio,
        group,
        step,
        weight: rowMultiplier(step, plan.rowMultipliers) * plan.columnMultipliers[group],
      });
    }
  }

  const payroll = base.reduce((sum, line) => sum + line.baseSalary, 0);
  const budget = budgetOf(plan, payroll);
  const fixed = base.filter((line) => plan.overrides[line.row.employee.id] !== undefined);
  const shared = base.filter((line) => plan.overrides[line.row.employee.id] === undefined);
  const left = (budget ?? 0) - fixed.reduce((sum, line) => sum + plan.overrides[line.row.employee.id], 0);
  const totalWeight = shared.reduce((sum, line) => sum + line.baseSalary * line.weight, 0);

  const spendAt = (anchor: number) =>
    shared.reduce((sum, line) => sum + roundUp(line.baseSalary * anchor * line.weight, plan.roundTo), 0);
  // Without rounding this is exact. Rounding up only adds, so the answer lies below it:
  // narrow down to the largest anchor that still fits the budget.
  let anchor = left > 0 && totalWeight > 0 ? left / totalWeight : 0;
  if (plan.roundTo > 0 && anchor > 0) {
    let low = 0;
    let high = anchor;
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      if (spendAt(mid) <= left) low = mid;
      else high = mid;
    }
    anchor = low;
  }

  const lines = base.map((line): MeritLine => {
    const override = plan.overrides[line.row.employee.id];
    const suggested = line.baseSalary * anchor * line.weight;
    const amount = override !== undefined ? override : roundUp(suggested, plan.roundTo);
    const newSalary = line.baseSalary + amount;
    return {
      ...line,
      suggested,
      suggestedPercent: anchor * line.weight,
      amount,
      percent: amount / line.baseSalary,
      overridden: override !== undefined,
      newSalary,
      newRatio: newSalary / line.grade.mid,
      overMax: newSalary > line.grade.max,
    };
  });
  const spend = lines.reduce((sum, line) => sum + line.amount, 0);
  // To the satang, and never "-0".
  const gap = Math.round(((budget ?? 0) - spend) * 100) / 100 || 0;
  const budgetRatio = budget !== null && payroll > 0 ? budget / payroll : null;
  return { lines, excluded, payroll, budget, budgetRatio, anchor, spend, gap };
}
