export type DepartmentId =
  | "interior-designer"
  | "3d-visualizer"
  | "business-development"
  | "business-administration";

/** Rank within a department, 1 = most junior. The levels in use are in JobLevel. */
export type Level = number;

/** One level of one department; admin can add, rename and remove them. */
export interface JobLevel {
  departmentId: DepartmentId;
  level: Level;
  /** Grade, e.g. "Level 1" or "Director". */
  name: string;
  /** Job title at this level, e.g. "Junior Interior Designer". */
  title: string;
}

export type AppraisalType = "Annual" | "Mid-year" | "Probation";

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
  appraisalType: AppraisalType;
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

/** An appraisal round. */
export interface Cycle {
  /** Name shown to users, e.g. "FY2026/27". */
  id: string;
  /** Free text, e.g. "ต.ค. 2026 – ก.ย. 2027". */
  period: string;
  /** The round being filled in now; every other round is read-only history. */
  current: boolean;
}

/**
 * The form and the people as they were when the result was confirmed or the cycle closed.
 * History is read from this, so later edits to templates, levels or employees do not change it.
 */
export interface EvaluationSnapshot {
  template: FormTemplate;
  employee: Pick<
    User,
    | "code"
    | "name"
    | "position"
    | "team"
    | "departmentId"
    | "level"
    | "supervisorId"
    | "startDate"
    | "levelSince"
    | "appraisalType"
  >;
  jobLevel: JobLevel | null;
  supervisorName: string | null;
  takenAt: string;
}

export interface Evaluation {
  employeeId: string;
  /** Cycle id. */
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
  snapshot: EvaluationSnapshot | null;
}

/* ------------------------------------------------------------------ */
/* API payloads                                                        */
/* ------------------------------------------------------------------ */

/** Everything the dashboard / team pages need, already limited to what the viewer may see. */
export interface OverviewData {
  /** The cycle the evaluations belong to. */
  cycle: Cycle;
  cycles: Cycle[];
  users: User[];
  levels: JobLevel[];
  templates: FormTemplate[];
  /** Keyed by employee id. */
  evaluations: Record<string, Evaluation>;
}

export interface EvaluationBundle {
  cycle: Cycle;
  /** Cycles in which this employee has a form, newest first. */
  cycles: Cycle[];
  /** True for a past cycle: nobody can change it. */
  readOnly: boolean;
  employee: Employee;
  /** Null when the employee's level has been removed. */
  jobLevel: JobLevel | null;
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
