export type DepartmentId =
  | "interior-designer"
  | "3d-visualizer"
  | "business-development"
  | "business-administration";

export type Level = 1 | 2 | 3;

/** Sections that count towards the Performance Score. */
export type WeightedSectionKey = "A" | "B" | "C" | "D" | "E";
/** All scored sections. F (Potential) is scored but not weighted. */
export type SectionKey = WeightedSectionKey | "F";

export type ExpectedLevel = "Beginner" | "Basic" | "Intermediate" | "Advanced" | "Expert";

export type Weights = Record<WeightedSectionKey, number>;

export interface Question {
  id: string;
  title: string;
  /** Expected behaviour / how the item is measured. */
  description: string;
  /** Section A. */
  target?: string;
  /** Sections B and D. */
  expectedLevel?: ExpectedLevel;
  /** Sections C, E, F: the extra reference column (meaning / example / what to observe). */
  note?: string;
}

/** One template per Department x Level; every section is editable by admin. */
export interface FormTemplate {
  departmentId: DepartmentId;
  level: Level;
  /** Percentages, must total 100. */
  weights: Weights;
  sections: Record<SectionKey, Question[]>;
  updatedAt: string | null;
}

export type Role = "employee" | "supervisor" | "admin";

export interface User {
  id: string;
  /** 5-digit employee code, used to log in. */
  code: string;
  name: string;
  role: Role;
  position: string;
  team: string;
  /** Null for people outside the four appraised departments (e.g. HR admin). */
  departmentId: DepartmentId | null;
  /** Null when the person is not appraised with this form. */
  level: Level | null;
  supervisorId: string | null;
  startDate: string | null;
  levelSince: string | null;
}

/** A user who has an appraisal form. */
export type Employee = User & {
  departmentId: DepartmentId;
  level: Level;
  supervisorId: string;
};

export type Rater = "self" | "supervisor";

export interface ItemScore {
  self: number | null;
  supervisor: number | null;
  comment: string;
  /** Section A: actual result against the target. Sections C/E/F: example evidence. */
  evidence: string;
}

export interface IdpPlanRow {
  id: string;
  area: string;
  /** Development activity (70% on-the-job / 20% coaching / 10% training). */
  activity: string;
  support: string;
  due: string;
  measure: string;
}

export interface Idp {
  strengths: string;
  improvements: string;
  careerGoal: string;
  plan: IdpPlanRow[];
  /** Supervisor's recommendation. */
  recommendation: string;
}

export interface SignOffComments {
  employee: string;
  supervisor: string;
  director: string;
  hr: string;
}

/**
 * draft          - employee is filling in the self-assessment
 * self_submitted - waiting for the supervisor's assessment
 * completed      - supervisor has confirmed the result
 */
export type EvaluationStatus = "draft" | "self_submitted" | "completed";

export interface Evaluation {
  employeeId: string;
  cycle: string;
  status: EvaluationStatus;
  /** Keyed by question id. */
  scores: Record<string, ItemScore>;
  /** Extra section-A KPIs that belong to this employee only. */
  personalKpis: Question[];
  idp: Idp;
  comments: SignOffComments;
  updatedAt: string | null;
  selfSubmittedAt: string | null;
  completedAt: string | null;
}

/* ------------------------------------------------------------------ */
/* API payloads                                                        */
/* ------------------------------------------------------------------ */

/** Everything the dashboard / team pages need, already limited to what the viewer may see. */
export interface OverviewData {
  users: User[];
  templates: FormTemplate[];
  /** Keyed by employee id. */
  evaluations: Record<string, Evaluation>;
}

export interface EvaluationBundle {
  employee: Employee;
  supervisorName: string | null;
  template: FormTemplate;
  evaluation: Evaluation;
  /** True when the supervisor's scores and comments were withheld from this viewer. */
  supervisorHidden: boolean;
}

/**
 * save        - keep the current status
 * submit_self - employee sends the self-assessment to the supervisor
 * send_back   - supervisor returns it to the employee
 * confirm     - supervisor confirms the result
 * reopen      - supervisor / admin reopens a confirmed result
 */
export type EvaluationAction = "save" | "submit_self" | "send_back" | "confirm" | "reopen";

/** Fields admin can set when adding or editing an employee. */
export type EmployeeInput = Omit<User, "id">;
