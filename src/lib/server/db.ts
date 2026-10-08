import "server-only";
import { CURRENT_CYCLE } from "../constants";
import { buildDefaultTemplates } from "../default-templates";
import { findLevel } from "../evaluation";
import type {
  DepartmentId,
  EmployeeInput,
  Evaluation,
  FormTemplate,
  JobLevel,
  Level,
  User,
} from "../types";
import { HttpError } from "./errors";
import { db } from "./supabase";

/** Database access. Rows use snake_case columns; the app uses the camelCase types. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = "23505";

function check<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new Error(`Supabase: ${result.error.message}`);
  return result.data;
}

/* ----------------------------- employees ----------------------------- */

interface EmployeeRow {
  id: string;
  code: string;
  name: string;
  role: User["role"];
  position: string;
  team: string;
  department_id: DepartmentId | null;
  level: Level | null;
  supervisor_id: string | null;
  start_date: string | null;
  level_since: string | null;
  appraisal_type: User["appraisalType"];
}

const toUser = (row: EmployeeRow): User => ({
  id: row.id,
  code: row.code,
  name: row.name,
  role: row.role,
  position: row.position,
  team: row.team,
  departmentId: row.department_id,
  level: row.level,
  supervisorId: row.supervisor_id,
  startDate: row.start_date,
  levelSince: row.level_since,
  appraisalType: row.appraisal_type,
});

const toEmployeeRow = (input: EmployeeInput): Omit<EmployeeRow, "id"> => ({
  code: input.code,
  name: input.name,
  role: input.role,
  position: input.position,
  team: input.team,
  department_id: input.departmentId,
  level: input.level,
  supervisor_id: input.supervisorId,
  start_date: input.startDate,
  level_since: input.levelSince,
  appraisal_type: input.appraisalType,
});

async function requireKnownLevel(input: EmployeeInput): Promise<void> {
  if (input.departmentId === null || input.level === null) return;
  if (!findLevel(await listLevels(), input.departmentId, input.level)) {
    throw new HttpError(400, "ไม่พบ Level นี้ในฝ่ายที่เลือก");
  }
}

export async function listUsers(): Promise<User[]> {
  const rows = check(await db().from("employees").select("*").order("code"));
  return (rows as EmployeeRow[]).map(toUser);
}

export async function getUser(id: string | null): Promise<User | null> {
  if (!id || !UUID.test(id)) return null;
  const row = check(await db().from("employees").select("*").eq("id", id).maybeSingle());
  return row ? toUser(row as EmployeeRow) : null;
}

export async function getUserByCode(code: string): Promise<User | null> {
  const row = check(await db().from("employees").select("*").eq("code", code).maybeSingle());
  return row ? toUser(row as EmployeeRow) : null;
}

export async function createUser(input: EmployeeInput): Promise<User> {
  await requireKnownLevel(input);
  const result = await db().from("employees").insert(toEmployeeRow(input)).select().single();
  if (result.error?.code === UNIQUE_VIOLATION) {
    throw new HttpError(409, `รหัสพนักงาน ${input.code} มีอยู่ในระบบแล้ว`);
  }
  return toUser(check(result) as EmployeeRow);
}

export async function updateUser(id: string, input: EmployeeInput): Promise<User> {
  await requireKnownLevel(input);
  const result = await db()
    .from("employees")
    .update(toEmployeeRow(input))
    .eq("id", id)
    .select()
    .maybeSingle();
  if (result.error?.code === UNIQUE_VIOLATION) {
    throw new HttpError(409, `รหัสพนักงาน ${input.code} มีอยู่ในระบบแล้ว`);
  }
  const row = check(result);
  if (!row) throw new HttpError(404, "ไม่พบพนักงานคนนี้");
  return toUser(row as EmployeeRow);
}

/** Also deletes the employee's evaluations (cascade) and unassigns their reports. */
export async function deleteUser(id: string): Promise<void> {
  check(await db().from("employees").delete().eq("id", id));
}

/* ------------------------------ levels ------------------------------- */

interface LevelRow {
  department_id: DepartmentId;
  level: Level;
  name: string;
  title: string;
}

export async function listLevels(): Promise<JobLevel[]> {
  const rows = check(
    await db().from("job_levels").select("*").order("department_id").order("level"),
  ) as LevelRow[];
  return rows.map((row) => ({
    departmentId: row.department_id,
    level: row.level,
    name: row.name,
    title: row.title,
  }));
}

/** Adds the level, or renames it when the department already has that level number. */
export async function saveLevel(level: JobLevel): Promise<JobLevel> {
  check(
    await db().from("job_levels").upsert({
      department_id: level.departmentId,
      level: level.level,
      name: level.name,
      title: level.title,
    }),
  );
  return level;
}

/** Refused while an employee is still on the level. */
export async function deleteLevel(departmentId: DepartmentId, level: Level): Promise<void> {
  const { count, error } = await db()
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("department_id", departmentId)
    .eq("level", level);
  if (error) throw new Error(`Supabase: ${error.message}`);
  if (count) {
    throw new HttpError(409, `ยังมีพนักงาน ${count} คนอยู่ใน Level นี้ กรุณาย้าย Level ของพนักงานก่อนลบ`);
  }
  check(await db().from("job_levels").delete().eq("department_id", departmentId).eq("level", level));
}

/* ----------------------------- templates ----------------------------- */

interface TemplateRow {
  department_id: DepartmentId;
  level: Level;
  weights: FormTemplate["weights"];
  sections: FormTemplate["sections"];
  updated_at: string;
}

/** One template per level in use: the built-in defaults, replaced by any that admin has saved. */
export async function getTemplates(levels?: JobLevel[]): Promise<FormTemplate[]> {
  const [rows, knownLevels] = await Promise.all([
    db().from("form_templates").select("*").then(check) as Promise<TemplateRow[]>,
    levels ?? listLevels(),
  ]);
  return buildDefaultTemplates(knownLevels).map((fallback) => {
    const saved = rows.find(
      (r) => r.department_id === fallback.departmentId && r.level === fallback.level,
    );
    return saved
      ? {
          departmentId: saved.department_id,
          level: saved.level,
          weights: saved.weights,
          sections: saved.sections,
          updatedAt: saved.updated_at,
        }
      : fallback;
  });
}

export async function saveTemplate(template: FormTemplate): Promise<FormTemplate> {
  const updatedAt = new Date().toISOString();
  check(
    await db().from("form_templates").upsert({
      department_id: template.departmentId,
      level: template.level,
      weights: template.weights,
      sections: template.sections,
      updated_at: updatedAt,
    }),
  );
  return { ...template, updatedAt };
}

/* ---------------------------- evaluations ---------------------------- */

interface EvaluationRow {
  employee_id: string;
  cycle: string;
  status: Evaluation["status"];
  scores: Evaluation["scores"];
  personal_kpis: Evaluation["personalKpis"];
  idp: Evaluation["idp"];
  comments: Evaluation["comments"];
  updated_at: string | null;
  self_submitted_at: string | null;
  completed_at: string | null;
}

const toEvaluation = (row: EvaluationRow): Evaluation => ({
  employeeId: row.employee_id,
  cycle: row.cycle,
  status: row.status,
  scores: row.scores,
  personalKpis: row.personal_kpis,
  idp: row.idp,
  comments: row.comments,
  updatedAt: row.updated_at,
  selfSubmittedAt: row.self_submitted_at,
  completedAt: row.completed_at,
});

/** Evaluations of the current cycle keyed by employee id; all of them, or only `employeeIds`. */
export async function listEvaluations(employeeIds?: string[]): Promise<Record<string, Evaluation>> {
  if (employeeIds && employeeIds.length === 0) return {};
  let query = db().from("evaluations").select("*").eq("cycle", CURRENT_CYCLE);
  if (employeeIds) query = query.in("employee_id", employeeIds);
  const rows = check(await query) as EvaluationRow[];
  return Object.fromEntries(rows.map((row) => [row.employee_id, toEvaluation(row)]));
}

export async function getEvaluation(employeeId: string): Promise<Evaluation | null> {
  const row = check(
    await db()
      .from("evaluations")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("cycle", CURRENT_CYCLE)
      .maybeSingle(),
  );
  return row ? toEvaluation(row as EvaluationRow) : null;
}

export async function saveEvaluation(evaluation: Evaluation): Promise<void> {
  const row: EvaluationRow = {
    employee_id: evaluation.employeeId,
    cycle: evaluation.cycle,
    status: evaluation.status,
    scores: evaluation.scores,
    personal_kpis: evaluation.personalKpis,
    idp: evaluation.idp,
    comments: evaluation.comments,
    updated_at: evaluation.updatedAt,
    self_submitted_at: evaluation.selfSubmittedAt,
    completed_at: evaluation.completedAt,
  };
  check(await db().from("evaluations").upsert(row));
}
