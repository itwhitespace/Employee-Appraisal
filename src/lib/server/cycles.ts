import "server-only";
import { findLevel, findTemplate, isEmployee } from "../evaluation";
import type { Cycle, Employee, EvaluationSnapshot, FormTemplate, JobLevel } from "../types";
import {
  createCycle,
  deleteCycle,
  getScales,
  getTemplates,
  listCycles,
  listEvaluationCycles,
  listEvaluations,
  listLevels,
  listUsers,
  markCurrentCycle,
  saveEvaluation,
  updateCyclePeriod,
} from "./db";
import { HttpError } from "./errors";

/** Appraisal rounds: which one is open, and freezing a round when the next one starts. */

/** The requested cycle, or the current one when `cycleId` is empty. */
export async function resolveCycle(cycleId?: string | null): Promise<{ cycle: Cycle; cycles: Cycle[] }> {
  const cycles = await listCycles();
  const cycle = cycleId
    ? cycles.find((c) => c.id === cycleId)
    : (cycles.find((c) => c.current) ?? cycles[0]);
  if (!cycle) throw new HttpError(404, cycleId ? "ไม่พบรอบประเมินนี้" : "ยังไม่มีรอบประเมินในระบบ");
  return { cycle, cycles };
}

export function buildSnapshot(
  employee: Employee,
  template: FormTemplate,
  jobLevel: JobLevel | null,
  supervisorName: string | null,
): EvaluationSnapshot {
  return {
    template,
    employee: {
      code: employee.code,
      name: employee.name,
      position: employee.position,
      team: employee.team,
      departmentId: employee.departmentId,
      level: employee.level,
      supervisorId: employee.supervisorId,
      startDate: employee.startDate,
      levelSince: employee.levelSince,
      appraisalType: employee.appraisalType,
    },
    jobLevel,
    supervisorName,
    takenAt: new Date().toISOString(),
  };
}

export async function listCyclesWithCounts(): Promise<(Cycle & { evaluations: number })[]> {
  const [cycles, used] = await Promise.all([listCycles(), listEvaluationCycles()]);
  return cycles.map((cycle) => ({
    ...cycle,
    evaluations: used.filter((id) => id === cycle.id).length,
  }));
}

export async function addCycle(id: string, period: string): Promise<void> {
  await createCycle(id, period);
}

export async function editCycle(id: string, period: string): Promise<void> {
  await resolveCycle(id);
  await updateCyclePeriod(id, period);
}

/**
 * Makes `id` the cycle everyone fills in. The cycle being closed is frozen first:
 * every form in it that has no snapshot yet gets one, and all of them keep the
 * scales of that moment, so it stays as it was.
 */
export async function switchCycle(id: string): Promise<void> {
  const { cycle: next, cycles } = await resolveCycle(id);
  const previous = cycles.find((c) => c.current);
  if (previous?.id === next.id) return;

  if (previous) {
    const [evaluations, users, levels, scales] = await Promise.all([
      listEvaluations(previous.id),
      listUsers(),
      listLevels(),
      getScales(),
    ]);
    const templates = await getTemplates(levels);
    for (const evaluation of Object.values(evaluations)) {
      if (evaluation.snapshot) {
        await saveEvaluation({ ...evaluation, snapshot: { ...evaluation.snapshot, scales } });
        continue;
      }
      const employee = users.find((u) => u.id === evaluation.employeeId);
      if (!employee || !isEmployee(employee)) continue;
      await saveEvaluation({
        ...evaluation,
        snapshot: {
          ...buildSnapshot(
            employee,
            findTemplate(templates, employee.departmentId, employee.level),
            findLevel(levels, employee.departmentId, employee.level) ?? null,
            users.find((u) => u.id === employee.supervisorId)?.name ?? null,
          ),
          scales,
        },
      });
    }
  }
  await markCurrentCycle(next.id);
}

/** Only an unused cycle that is not the current one can be removed. */
export async function removeCycle(id: string): Promise<void> {
  const { cycle } = await resolveCycle(id);
  if (cycle.current) throw new HttpError(409, "ลบรอบประเมินปัจจุบันไม่ได้");
  const used = (await listEvaluationCycles()).filter((c) => c === id).length;
  if (used > 0) throw new HttpError(409, `รอบนี้มีแบบประเมิน ${used} ใบ จึงลบไม่ได้`);
  await deleteCycle(id);
}
