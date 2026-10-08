import "server-only";
import { CURRENT_CYCLE } from "../constants";
import { buildDefaultTemplates } from "../default-templates";
import { findTemplate } from "../evaluation";
import type {
  DepartmentId,
  EmployeeInput,
  Evaluation,
  FormTemplate,
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
});

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
  const result = await db().from("employees").insert(toEmployeeRow(input)).select().single();
  if (result.error?.code === UNIQUE_VIOLATION) {
    throw new HttpError(409, `รหัสพนักงาน ${input.code} มีอยู่ในระบบแล้ว`);
  }
  return toUser(check(result) as EmployeeRow);
}

export async function updateUser(id: string, input: EmployeeInput): Promise<User> {
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

/* ----------------------------- templates ----------------------------- */

interface TemplateRow {
  department_id: DepartmentId;
  level: Level;
  weights: FormTemplate["weights"];
  sections: FormTemplate["sections"];
  updated_at: string;
}

/** All 12 templates: the built-in defaults, replaced by any that admin has saved. */
export async function getTemplates(): Promise<FormTemplate[]> {
  const rows = check(await db().from("form_templates").select("*")) as TemplateRow[];
  return buildDefaultTemplates().map((fallback) => {
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

export async function getTemplate(departmentId: DepartmentId, level: Level): Promise<FormTemplate> {
  return findTemplate(await getTemplates(), departmentId, level);
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
