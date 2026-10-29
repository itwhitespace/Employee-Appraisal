import "server-only";
import { salaryInEffect } from "../compensation";
import { findLevel, findTemplate, isEmployee } from "../evaluation";
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
} from "./db";

/** Today in Thailand, as yyyy-mm-dd. */
export const todayInThailand = (): string =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

/**
 * Everyone with an appraisal form (people without a department and level, such as the MD,
 * are left out), with their pay, salary grade and approved Performance Score of the
 * current cycle.
 */
export async function compensationOverview(): Promise<CompensationOverview> {
  const [{ cycle }, users, levels, structure, salaries, testScores] = await Promise.all([
    resolveCycle(),
    listUsers(),
    listLevels(),
    getSalaryStructure(),
    listSalaryHistory(),
    listTestScores(),
  ]);
  const [templates, evaluations] = await Promise.all([
    getTemplates(levels),
    listEvaluations(cycle.id),
  ]);
  const today = todayInThailand();

  const rows = users.filter(isEmployee).map((user): CompensationRow => {
    const evaluation = evaluations[user.id];
    const approved = evaluation?.status === "approved" ? evaluation : null;
    const template =
      approved?.snapshot?.template ?? findTemplate(templates, user.departmentId, user.level);
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
      },
      levelName,
      // Grades go by the level's name, the same in every department.
      grade: (levelName && structure.grades.find((g) => g.levelName === levelName)?.grade) || null,
      salary: salaryInEffect(history, today),
      history,
      // An approved appraisal always wins over a made-up test score.
      performance: approved
        ? summarize(template, approved).performance.supervisor
        : (testScores[user.id] ?? null),
      performanceIsTest: !approved && testScores[user.id] !== undefined,
    };
  });
  return { cycleId: cycle.id, structure, rows };
}
