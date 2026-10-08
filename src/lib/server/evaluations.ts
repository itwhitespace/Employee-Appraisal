import "server-only";
import {
  createEmptyEvaluation,
  EMPTY_SCORE,
  findLevel,
  findTemplate,
  isEmployee,
  withoutSupervisorInput,
} from "../evaluation";
import { canViewEvaluation } from "../permissions";
import { getSectionQuestions, summarize } from "../scoring";
import type {
  Employee,
  Evaluation,
  EvaluationAction,
  EvaluationBundle,
  FormTemplate,
  Idp,
  IdpPlanRow,
  Question,
  User,
} from "../types";
import { getEvaluation, getTemplates, getUser, listLevels, saveEvaluation } from "./db";
import { HttpError } from "./errors";

/**
 * Reading and updating one appraisal. The browser sends the whole form back;
 * this module decides which parts the caller is allowed to change, so the
 * rules cannot be bypassed from the client.
 */

const MAX_TEXT = 4000;
const MAX_ROWS = 30;

const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value.slice(0, MAX_TEXT) : fallback;

const score = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value.slice(0, MAX_ROWS) : []);

function cleanPersonalKpis(value: unknown): Question[] {
  return list(value).flatMap((item) => {
    const kpi = record(item);
    // The "pk-" prefix keeps personal KPI ids from colliding with template question ids.
    if (typeof kpi.id !== "string" || !kpi.id.startsWith("pk-")) return [];
    return [
      {
        id: kpi.id.slice(0, 60),
        title: text(kpi.title),
        description: text(kpi.description),
        target: text(kpi.target),
      },
    ];
  });
}

function cleanPlan(value: unknown): IdpPlanRow[] {
  return list(value).flatMap((item, index) => {
    const row = record(item);
    return [
      {
        id: typeof row.id === "string" ? row.id.slice(0, 60) : `idp-${index + 1}`,
        area: text(row.area),
        activity: text(row.activity),
        support: text(row.support),
        due: text(row.due),
        measure: text(row.measure),
      },
    ];
  });
}

interface Access {
  isOwner: boolean;
  isSupervisor: boolean;
  isAdmin: boolean;
  /** Employee may edit the self-assessment. */
  canSelf: boolean;
  /** Supervisor may edit their assessment. */
  canSupervisor: boolean;
}

function accessOf(viewer: User, employee: Employee, evaluation: Evaluation): Access {
  const isOwner = viewer.id === employee.id;
  const isSupervisor = viewer.id === employee.supervisorId;
  return {
    isOwner,
    isSupervisor,
    isAdmin: viewer.role === "admin",
    canSelf: isOwner && evaluation.status === "draft",
    canSupervisor: isSupervisor && evaluation.status !== "completed",
  };
}

async function loadContext(viewer: User, employeeId: string) {
  const employee = await getUser(employeeId);
  if (!employee || !isEmployee(employee)) {
    throw new HttpError(404, "ไม่พบแบบประเมินของพนักงานคนนี้");
  }
  if (!canViewEvaluation(viewer, employee)) {
    throw new HttpError(403, "คุณไม่มีสิทธิ์เปิดแบบประเมินนี้");
  }
  const [levels, stored, supervisor] = await Promise.all([
    listLevels(),
    getEvaluation(employee.id),
    getUser(employee.supervisorId),
  ]);
  const template = findTemplate(
    await getTemplates(levels),
    employee.departmentId,
    employee.level,
  );
  return {
    employee,
    jobLevel: findLevel(levels, employee.departmentId, employee.level) ?? null,
    template,
    evaluation: stored ?? createEmptyEvaluation(employee.id),
    supervisorName: supervisor?.name ?? null,
  };
}

function toBundle(
  viewer: User,
  context: Awaited<ReturnType<typeof loadContext>>,
  evaluation: Evaluation,
): EvaluationBundle {
  const access = accessOf(viewer, context.employee, evaluation);
  // The employee does not see the supervisor's input until the result is confirmed.
  const supervisorHidden =
    access.isOwner && !access.isSupervisor && !access.isAdmin && evaluation.status !== "completed";
  return {
    employee: context.employee,
    jobLevel: context.jobLevel,
    supervisorName: context.supervisorName,
    template: context.template,
    evaluation: supervisorHidden ? withoutSupervisorInput(evaluation) : evaluation,
    supervisorHidden,
  };
}

export async function loadEvaluation(viewer: User, employeeId: string): Promise<EvaluationBundle> {
  const context = await loadContext(viewer, employeeId);
  return toBundle(viewer, context, context.evaluation);
}

/** Copies onto `stored` only the fields this viewer may change at the current stage. */
function mergeAllowed(
  stored: Evaluation,
  incoming: Record<string, unknown>,
  template: FormTemplate,
  access: Access,
): Evaluation {
  const next: Evaluation = structuredClone(stored);
  const idp = record(incoming.idp);
  const comments = record(incoming.comments);

  if (access.canSelf || access.canSupervisor) {
    next.personalKpis = cleanPersonalKpis(incoming.personalKpis);

    const removedKpis = stored.personalKpis.filter(
      (old) => !next.personalKpis.some((kpi) => kpi.id === old.id),
    );
    for (const kpi of removedKpis) delete next.scores[kpi.id];

    const incomingScores = record(incoming.scores);
    const questions = Object.values(getSectionQuestions(template, next)).flat();
    for (const question of questions) {
      const previous = stored.scores[question.id] ?? EMPTY_SCORE;
      const sent = record(incomingScores[question.id]);
      next.scores[question.id] = {
        self: access.canSelf ? score(sent.self) : previous.self,
        supervisor: access.canSupervisor ? score(sent.supervisor) : previous.supervisor,
        comment: text(sent.comment, previous.comment),
        evidence: text(sent.evidence, previous.evidence),
      };
    }

    const nextIdp: Idp = {
      strengths: text(idp.strengths, stored.idp.strengths),
      improvements: text(idp.improvements, stored.idp.improvements),
      careerGoal: text(idp.careerGoal, stored.idp.careerGoal),
      plan: Array.isArray(idp.plan) ? cleanPlan(idp.plan) : stored.idp.plan,
      recommendation: access.canSupervisor
        ? text(idp.recommendation, stored.idp.recommendation)
        : stored.idp.recommendation,
    };
    next.idp = nextIdp;
  }

  if (access.canSelf) next.comments.employee = text(comments.employee, stored.comments.employee);
  if (access.canSupervisor) {
    next.comments.supervisor = text(comments.supervisor, stored.comments.supervisor);
  }
  if (access.isAdmin) {
    next.comments.director = text(comments.director, stored.comments.director);
    next.comments.hr = text(comments.hr, stored.comments.hr);
  }
  return next;
}

export async function updateEvaluation(
  viewer: User,
  employeeId: string,
  incoming: Record<string, unknown>,
  action: EvaluationAction,
): Promise<EvaluationBundle> {
  const context = await loadContext(viewer, employeeId);
  const stored = context.evaluation;
  const access = accessOf(viewer, context.employee, stored);

  if (!access.canSelf && !access.canSupervisor && !access.isAdmin && action !== "reopen") {
    throw new HttpError(403, "แบบประเมินนี้แก้ไขไม่ได้ในขั้นตอนปัจจุบัน");
  }

  const next = mergeAllowed(stored, incoming, context.template, access);
  const now = new Date().toISOString();
  const missing = () => summarize(context.template, next).missing;
  const untitledKpi = next.personalKpis.some((kpi) => kpi.title.trim() === "");

  switch (action) {
    case "save":
      break;
    case "submit_self":
      if (!access.canSelf) throw new HttpError(403, "ส่งแบบประเมินตนเองไม่ได้ในขั้นตอนนี้");
      if (untitledKpi) throw new HttpError(400, "มี KPI เฉพาะบุคคลที่ยังไม่ได้ตั้งชื่อ");
      if (missing().self > 0) throw new HttpError(400, "ยังกรอกคะแนน Self ไม่ครบทุกข้อ");
      next.status = "self_submitted";
      next.selfSubmittedAt = now;
      break;
    case "send_back":
      if (!access.isSupervisor || stored.status !== "self_submitted") {
        throw new HttpError(403, "ส่งกลับให้พนักงานไม่ได้ในขั้นตอนนี้");
      }
      next.status = "draft";
      next.selfSubmittedAt = null;
      break;
    case "confirm":
      if (!access.isSupervisor || stored.status !== "self_submitted") {
        throw new HttpError(403, "ยืนยันผลได้หลังจากพนักงานส่งแบบประเมินตนเองแล้วเท่านั้น");
      }
      if (untitledKpi) throw new HttpError(400, "มี KPI เฉพาะบุคคลที่ยังไม่ได้ตั้งชื่อ");
      if (missing().supervisor > 0) {
        throw new HttpError(400, "ยังกรอกคะแนน Supervisor ไม่ครบทุกข้อ");
      }
      next.status = "completed";
      next.completedAt = now;
      break;
    case "reopen":
      if (!(access.isSupervisor || access.isAdmin) || stored.status !== "completed") {
        throw new HttpError(403, "เปิดแก้ไขอีกครั้งไม่ได้ในขั้นตอนนี้");
      }
      next.status = "self_submitted";
      next.completedAt = null;
      break;
    default:
      throw new HttpError(400, "ไม่รู้จักคำสั่งนี้");
  }

  next.updatedAt = now;
  await saveEvaluation(next);
  return toBundle(viewer, context, next);
}
