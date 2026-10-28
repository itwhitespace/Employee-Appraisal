import type { SalaryGrade, SalaryRecord } from "./types";

/** Compa-ratio groups of the Merit Increase Matrix, lowest first. `from` is inclusive. */
export const COMPA_GROUPS = [
  { from: 0, label: "ต่ำกว่า 80%", tone: "bg-amber-100 text-amber-800" },
  { from: 0.8, label: "80–90%", tone: "bg-yellow-50 text-yellow-800" },
  { from: 0.9, label: "90–110%", tone: "bg-emerald-50 text-emerald-700" },
  { from: 1.1, label: "110–120%", tone: "bg-sky-50 text-sky-700" },
  { from: 1.2, label: "เกิน 120%", tone: "bg-violet-50 text-violet-700" },
] as const;

/** Base salary ÷ the grade's Mid; allowances are left out, as in the Excel model. */
export function compaRatio(salary: SalaryRecord | null, grade: SalaryGrade | undefined): number | null {
  if (!salary || !grade || grade.mid <= 0) return null;
  return salary.baseSalary / grade.mid;
}

/** Index into COMPA_GROUPS. */
export function compaGroup(ratio: number): number {
  // Rounded first, so that e.g. 0.8999 shown as "90%" falls in the 90–110% group.
  const rounded = Math.round(ratio * 1000) / 1000;
  let group = 0;
  COMPA_GROUPS.forEach((g, i) => {
    if (rounded >= g.from) group = i;
  });
  return group;
}

/** The record in effect on `today` (yyyy-mm-dd): the newest that has started. */
export function salaryInEffect(history: SalaryRecord[], today: string): SalaryRecord | null {
  return history.find((record) => record.effectiveDate <= today) ?? null;
}

export const baht = (value: number): string =>
  value.toLocaleString("th-TH", { maximumFractionDigits: 0 });

export const percent = (ratio: number): string => `${Math.round(ratio * 100)}%`;
