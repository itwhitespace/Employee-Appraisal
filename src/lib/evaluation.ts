import { ALL_SECTIONS, DEFAULT_WEIGHTS, WEIGHTED_SECTIONS } from "./constants";
import type {
  DepartmentId,
  Employee,
  Evaluation,
  FormTemplate,
  ItemScore,
  JobLevel,
  Level,
  User,
} from "./types";

/** Pure helpers shared by the browser and the server. */

export function isEmployee(user: User): user is Employee {
  return user.departmentId !== null && user.level !== null && user.supervisorId !== null;
}

export function findLevel(
  levels: JobLevel[],
  departmentId: DepartmentId | null,
  level: Level | null,
): JobLevel | undefined {
  return levels.find((l) => l.departmentId === departmentId && l.level === level);
}

export const EMPTY_SCORE: ItemScore = { self: null, supervisor: null, comment: "", evidence: "" };

export function createEmptyEvaluation(employeeId: string, cycle: string): Evaluation {
  return {
    employeeId,
    cycle,
    status: "draft",
    scores: {},
    personalKpis: [],
    idp: {
      strengths: "",
      improvements: "",
      careerGoal: "",
      plan: [1, 2, 3, 4].map((n) => ({
        id: `idp-${n}`,
        area: "",
        activity: "",
        support: "",
        due: "",
        measure: "",
      })),
      recommendation: "",
    },
    comments: { employee: "", supervisor: "", director: "", hr: "" },
    updatedAt: null,
    selfSubmittedAt: null,
    completedAt: null,
    snapshot: null,
  };
}

/** The copy an employee gets before the supervisor's result is confirmed. */
export function withoutSupervisorInput(evaluation: Evaluation): Evaluation {
  return {
    ...evaluation,
    scores: Object.fromEntries(
      Object.entries(evaluation.scores).map(([id, score]) => [id, { ...score, supervisor: null }]),
    ),
    idp: { ...evaluation.idp, recommendation: "" },
    comments: { ...evaluation.comments, supervisor: "", director: "", hr: "" },
  };
}

export function findTemplate(
  templates: FormTemplate[],
  departmentId: DepartmentId,
  level: Level,
): FormTemplate {
  return (
    templates.find((t) => t.departmentId === departmentId && t.level === level) ?? {
      departmentId,
      level,
      weights: { ...DEFAULT_WEIGHTS },
      sections: { A: [], B: [], C: [], D: [], E: [], F: [] },
      updatedAt: null,
    }
  );
}

/** Returns the reason a template cannot be saved, or null when it is valid. */
export function validateTemplate(template: FormTemplate): string | null {
  const total = WEIGHTED_SECTIONS.reduce((sum, key) => sum + template.weights[key], 0);
  if (total !== 100) return `น้ำหนักรวมต้องเท่ากับ 100% (ตอนนี้ ${total}%)`;
  for (const key of ALL_SECTIONS) {
    const questions = template.sections[key];
    if (questions.length === 0) return `หมวด ${key} ต้องมีอย่างน้อย 1 ข้อ`;
    if (questions.some((q) => q.title.trim() === ""))
      return `หมวด ${key} มีข้อที่ยังไม่ได้ใส่หัวข้อประเมิน`;
  }
  return null;
}
