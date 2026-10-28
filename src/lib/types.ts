export type DepartmentId =
  | "interior-designer"
  | "drafter-cad"
  | "3d-visualizer"
  | "business-development"
  | "business-administration"
  | "it-support";

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
  /**
   * Years with the company by which someone at this level is expected to move on (the end
   * of the level's range in the Career Matrix). Null when not set, e.g. the top levels.
   */
  expectedYears?: number | null;
}

/** One row of the Rating Band table: the grade given from `min` up to the next band. */
export interface RatingBand {
  /** Lowest Performance Score that earns this grade. */
  min: number;
  /** e.g. "B - Meets Expectations". */
  grade: string;
  /** What the grade means and what follows from it. */
  meaning: string;
  /** Suggested share of staff, free text. */
  share: string;
  /** Suggested merit multiplier, free text. */
  merit: string;
}

export type BandLevel = "Low" | "Medium" | "High";

/** Lowest score of the Medium and of the High level; Low starts at 0. */
export interface BandThresholds {
  medium: number;
  high: number;
}

/** Everything admin sets on the Scale & Rating page. */
export interface Scales {
  /** Lowest band first. */
  ratingBands: RatingBand[];
  /** Levels of the Potential score (section F): the Y axis of the 9-Box. */
  potential: BandThresholds;
  /** Levels of the Performance Score: the X axis of the 9-Box. */
  performance: BandThresholds;
  /** 9-Box names, indexed as [potential level][performance level], 0 = Low, 2 = High. */
  nineBox: string[][];
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
  nickname: string;
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
  /**
   * May open the compensation pages (salary structure, Compa-ratio). Granted only in the
   * database, never from the app, so no admin can give it to themselves.
   */
  compensationAccess: boolean;
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
 * completed      - supervisor has confirmed the result; waiting for admin to approve it
 * approved       - admin has approved it; the employee now sees the whole form
 */
export type EvaluationStatus = "draft" | "self_submitted" | "completed" | "approved";

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
  /** The scales when the cycle closed; absent on older snapshots. */
  scales?: Scales;
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
  approvedAt: string | null;
  /** Id of the admin who approved it. */
  approvedBy: string | null;
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
  /** The scales the cycle is graded with. */
  scales: Scales;
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
  /** The scales this form is graded with. */
  scales: Scales;
  evaluation: Evaluation;
  /** True when the supervisor's scores and comments were withheld from this viewer. */
  supervisorHidden: boolean;
  /**
   * True for the employee once the result is confirmed: the form is closed to them until
   * the next cycle, and its scores and comments were withheld.
   */
  closed: boolean;
}

/**
 * save        - keep the current status
 * submit_self - employee sends the self-assessment to the supervisor
 * send_back   - supervisor returns it to the employee
 * confirm     - supervisor confirms the result
 * reopen      - supervisor / admin reopens a confirmed result (before it is approved)
 * approve     - admin approves a confirmed result; the employee sees it
 * unapprove   - admin takes the approval back
 */
export type EvaluationAction =
  | "save"
  | "submit_self"
  | "send_back"
  | "confirm"
  | "reopen"
  | "approve"
  | "unapprove";

/** Fields admin can set when adding or editing an employee. */
export type EmployeeInput = Omit<User, "id" | "compensationAccess">;

/* ------------------------------------------------------------------ */
/* Compensation                                                        */
/* ------------------------------------------------------------------ */

/** One band of the salary structure; Compa-ratio = base salary ÷ `mid`. */
export interface SalaryGrade {
  /** 1 = the highest band. */
  grade: number;
  /** Title, e.g. "Studio Director". */
  name: string;
  /** Short code of the Job Grade table: MD, SM, SD, D, 4 … 1. */
  jobLevel: string;
  /** The level of the web app paid on this grade, in every department; null = none yet. */
  levelName: string | null;
  min: number;
  mid: number;
  max: number;
}

export interface SalaryStructure {
  grades: SalaryGrade[];
}

/** Pay from `effectiveDate` on; a raise adds a new record, so the history stays. */
export interface SalaryRecord {
  effectiveDate: string;
  baseSalary: number;
  allowance: number;
  note: string;
}

/** One appraised employee on the salary page. */
export interface CompensationRow {
  employee: Pick<User, "id" | "code" | "name" | "nickname" | "departmentId" | "level" | "startDate">;
  levelName: string | null;
  /** The grade whose level is the employee's level; null when there is none. */
  grade: number | null;
  /** The record in effect today; null when there is none yet. */
  salary: SalaryRecord | null;
  /** Newest first, including any that start later than today. */
  history: SalaryRecord[];
  /** Supervisor's Performance Score, only once admin has approved the result. */
  performance: number | null;
}

export interface CompensationOverview {
  /** The cycle the Performance Scores are from. */
  cycleId: string;
  structure: SalaryStructure;
  rows: CompensationRow[];
}

/** One line of the record of who opened or changed compensation data. */
export interface CompensationAuditEntry {
  at: string;
  actorName: string;
  action: string;
}

/**
 * How a cycle's merit increase is worked out. The budget is either a baht amount or a
 * percentage of the monthly base pay of the people taking part, before the raise, so it stays
 * put while the matrix is solved. Neither set = no budget yet.
 */
export interface MeritPlan {
  /** Percent of monthly base pay, e.g. 3 = 3%; used when `budgetAmount` is null. */
  targetPercent: number | null;
  /** Monthly budget in baht, typed in; takes the place of `targetPercent`. */
  budgetAmount: number | null;
  /** Competency 1 … 5, e.g. 0.6 … 1.5; scores between them are interpolated per 0.1. */
  rowMultipliers: number[];
  /** One per Compa-ratio group, lowest Compa-ratio first. */
  columnMultipliers: number[];
  /** Each raise is rounded up to this many baht; 0 = not rounded. */
  roundTo: number;
  /** People who have worked fewer months than this on the plan's date take no part. */
  minTenureMonths: number;
  /** Monthly raise in baht set by hand, keyed by employee id; the rest share what is left. */
  overrides: Record<string, number>;
}

export interface MeritData {
  overview: CompensationOverview;
  /** The saved plan of the cycle; null = never saved. */
  plan: MeritPlan | null;
  updatedAt: string | null;
}
