import "server-only";
import { salaryInEffect } from "../compensation";
import { findLevel, findTemplate, isEmployee, onPayScale } from "../evaluation";
import { summarize } from "../scoring";
import type { CompensationOverview, CompensationRow } from "../types";
import { resolveCycle } from "./cycles";
import {
  getSalaryStructure,
  getTemplates,
  listEvaluations,
  listLevels,
  listSalaryHistory,
  listTestScores,
  listUsers,
  type PayTables,
} from "./db";

/** Today in Thailand, as yyyy-mm-dd. */
export const todayInThailand = (): string =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

/**
 * Made-up scores for the sandbox, the same for a person every time (from their id), so the
 * merit and bonus pages have figures to try without touching the shared test scores.
 */
function demoScores(employeeId: string): { performance: number; potential: number } {
  let hash = 2166136261;
  for (const ch of employeeId) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  const performance = 2 + (hash % 281) / 100; // 2.00 … 4.80
  const potential = 2 + ((hash >>> 9) % 301) / 100; // 2.00 … 5.00
  return { performance, potential };
}

/**
 * Everyone with a department and level (with or without an appraisal form, so the MD too),
 * with their pay (from the tables of `pay`), salary grade and approved Performance Score of the
 * current cycle. In the sandbox, people without an approved appraisal get made-up scores.
 */
export async function compensationOverview(pay: PayTables): Promise<CompensationOverview> {
  const [{ cycle }, users, levels, structure, salaries, testScores] = await Promise.all([
    resolveCycle(),
    listUsers(),
    listLevels(),
    getSalaryStructure(),
    listSalaryHistory(pay),
    pay.sandbox ? Promise.resolve({} as Awaited<ReturnType<typeof listTestScores>>) : listTestScores(),
  ]);
  const [templates, evaluations] = await Promise.all([getTemplates(levels), listEvaluations(cycle.id)]);
  const today = todayInThailand();

  const rows = users.filter(onPayScale).map((user): CompensationRow => {
    const evaluation = evaluations[user.id];
    const approved = evaluation?.status === "approved" ? evaluation : null;
    const template = approved?.snapshot?.template ?? findTemplate(templates, user.departmentId, user.level);
    const history = salaries[user.id] ?? [];
    const levelName = findLevel(levels, user.departmentId, user.level)?.name ?? null;
    return {
      employee: {
        id: user.id,
        code: user.code,
        name: user.name,
        nickname: user.nickname,
        position: user.position,
        team: user.team,
        departmentId: user.departmentId,
        level: user.level,
        startDate: user.startDate,
        birthDate: user.birthDate,
      },
      appraised: isEmployee(user),
      levelName,
      // Grades go by the level's name, the same in every department.
      grade: (levelName && structure.grades.find((g) => g.levelName === levelName)?.grade) || null,
      salary: salaryInEffect(history, today),
      history,
      // An approved appraisal always wins over made-up test scores.
      ...(approved
        ? (() => {
            const summary = summarize(template, approved);
            return {
              performance: summary.performance.supervisor,
              potential: summary.potential.supervisor,
              performanceIsTest: false,
            };
          })()
        : pay.sandbox
          ? { ...demoScores(user.id), performanceIsTest: true }
          : {
              performance: testScores[user.id]?.performance ?? null,
              potential: testScores[user.id]?.potential ?? null,
              performanceIsTest: testScores[user.id] !== undefined,
            }),
    };
  });
  const directory = users.map(({ id, code, name, role, position, team, departmentId, supervisorId }) => ({
    id,
    code,
    name,
    role,
    position,
    team,
    departmentId,
    supervisorId,
  }));
  return { cycleId: cycle.id, structure, rows, levels, directory };
}
