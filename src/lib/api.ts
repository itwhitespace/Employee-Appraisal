import type {
  EmployeeImport,
  SalaryImport,
  BonusData,
  BonusPlan,
  CompensationAuditEntry,
  CompensationOverview,
  Cycle,
  EmployeeInput,
  Evaluation,
  EvaluationAction,
  EvaluationBundle,
  FormTemplate,
  JobLevel,
  MeritData,
  MeritPlan,
  OverviewData,
  SalaryRecord,
  SalaryStructure,
  Scales,
  User,
} from "./types";
import type { HardwareLine, LicenseInput, LicenseRenewal, SoftwareLicense } from "./software";

/** Browser-side client for the app's own API routes. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Fired on window when a compensation request finds the pages locked. */
export const COMPENSATION_LOCKED = "compensation-locked";

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
  }
  const data = await response.json().catch(() => null);
  // The compensation pages lapsed into their lock: let the lock screen ask for the password.
  if (response.status === 423 && typeof window !== "undefined") {
    window.dispatchEvent(new Event(COMPENSATION_LOCKED));
  }
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
  }
  return data as T;
}

const cycleQuery = (cycleId: string | null): string =>
  cycleId ? `?cycle=${encodeURIComponent(cycleId)}` : "";

export const api = {
  me: () => request<{ user: User | null; cycle: Cycle | null }>("/api/auth/me"),
  login: (code: string, password: string) =>
    request<{ user: User }>("/api/auth/login", "POST", { code, password }),
  logout: () => request<{ ok: true }>("/api/auth/logout", "POST"),

  /** `cycleId` null = the current cycle. */
  overview: (cycleId: string | null = null) => request<OverviewData>(`/api/overview${cycleQuery(cycleId)}`),

  evaluation: (employeeId: string, cycleId: string | null = null) =>
    request<EvaluationBundle>(`/api/evaluations/${employeeId}${cycleQuery(cycleId)}`),
  updateEvaluation: (employeeId: string, evaluation: Evaluation, action: EvaluationAction) =>
    request<EvaluationBundle>(`/api/evaluations/${employeeId}`, "PUT", { evaluation, action }),

  /** Admin only: approves a confirmed result, or takes the approval back. */
  setApproval: (employeeId: string, action: "approve" | "unapprove", cycleId: string | null = null) =>
    request<EvaluationBundle>(`/api/evaluations/${employeeId}${cycleQuery(cycleId)}`, "PUT", {
      evaluation: {},
      action,
    }),

  /** Admin only: deletes the form of the current cycle so the employee starts again. */
  clearEvaluation: (employeeId: string) => request<{ ok: true }>(`/api/evaluations/${employeeId}`, "DELETE"),

  templates: () => request<{ levels: JobLevel[]; templates: FormTemplate[] }>("/api/templates"),
  saveTemplate: (template: FormTemplate) =>
    request<{ template: FormTemplate }>("/api/templates", "PUT", template),

  /** Admin: people added and changed from the employee workbook (no pay). */
  importEmployees: (payload: EmployeeImport) =>
    request<{ created: number; updated: number }>("/api/employees/import", "POST", payload),
  createEmployee: (input: EmployeeInput, password: string) =>
    request<{ user: User }>("/api/employees", "POST", { ...input, password }),
  /** An empty `password` keeps the one the employee already has. */
  updateEmployee: (id: string, input: EmployeeInput, password: string) =>
    request<{ user: User }>(`/api/employees/${id}`, "PUT", { ...input, password }),
  deleteEmployee: (id: string) => request<{ ok: true }>(`/api/employees/${id}`, "DELETE"),

  cycles: () => request<{ cycles: (Cycle & { evaluations: number })[] }>("/api/cycles"),
  createCycle: (id: string, period: string) => request<{ ok: true }>("/api/cycles", "POST", { id, period }),
  updateCycle: (id: string, period: string) => request<{ ok: true }>("/api/cycles", "PUT", { id, period }),
  /** Closes the open cycle and opens this one. */
  openCycle: (id: string) => request<{ ok: true }>("/api/cycles", "PUT", { id, makeCurrent: true }),
  deleteCycle: (id: string) => request<{ ok: true }>("/api/cycles", "DELETE", { id }),

  scales: () => request<{ scales: Scales }>("/api/scales"),
  saveScales: (scales: Scales) => request<{ scales: Scales }>("/api/scales", "PUT", scales),

  /** Compensation access only; every call is recorded. */
  salaryStructure: () =>
    request<{ structure: SalaryStructure; levels: JobLevel[] }>("/api/compensation/structure"),
  saveSalaryStructure: (structure: SalaryStructure) =>
    request<{ structure: SalaryStructure }>("/api/compensation/structure", "PUT", structure),
  compensationAudit: () => request<{ audit: CompensationAuditEntry[] }>("/api/compensation/audit"),
  /** Records that the merit table is about to be downloaded. */
  logMeritExport: (rows: number) =>
    request<{ ok: true }>("/api/compensation/audit", "POST", { event: "merit-export", rows }),
  /** Records that one person's salary was opened. */
  logSalaryView: (employeeId: string) =>
    request<{ ok: true }>("/api/compensation/audit", "POST", { event: "salary-view", employeeId }),

  salaries: () => request<CompensationOverview>("/api/compensation/salaries"),
  /** Sandbox only: new made-up salaries for everyone. */
  drawDemoSalaries: () => request<CompensationOverview>("/api/compensation/demo", "POST"),
  saveSalary: (employeeId: string, record: SalaryRecord) =>
    request<CompensationOverview>(`/api/compensation/salaries/${employeeId}`, "PUT", record),
  /** Saves an import: new people, job titles and teams, then salaries. See the route for the body. */
  importSalaries: (payload: SalaryImport) =>
    request<CompensationOverview>("/api/compensation/salaries/import", "POST", payload),

  /** IT budget: hardware lines of a fiscal year (2026 = Oct 2026 – Sep 2027). */
  hardwareBudget: (year: number) => request<{ hardware: HardwareLine[] }>(`/api/it-budget?year=${year}`),
  saveHardwareBudget: (year: number, hardware: Omit<HardwareLine, "id">[]) =>
    request<{ hardware: HardwareLine[] }>("/api/it-budget", "PUT", { year, hardware }),
  /** IT Assets: software licenses (admin only). */
  licenses: () => request<{ licenses: SoftwareLicense[] }>("/api/software"),
  addLicense: (license: LicenseInput) =>
    request<{ licenses: SoftwareLicense[] }>("/api/software", "POST", { license }),
  importLicenses: (licenses: LicenseInput[]) =>
    request<{ created: number; licenses: SoftwareLicense[] }>("/api/software", "POST", { licenses }),
  saveLicense: (id: string, license: LicenseInput) =>
    request<{ licenses: SoftwareLicense[] }>(`/api/software/${id}`, "PUT", { license }),
  deleteLicense: (id: string) => request<{ licenses: SoftwareLicense[] }>(`/api/software/${id}`, "DELETE"),
  renewals: (id: string) => request<{ renewals: LicenseRenewal[] }>(`/api/software/${id}`),
  renewLicense: (
    id: string,
    term: {
      startDate: string | null;
      expireDate: string | null;
      pricePerYear: number | null;
      seats: number | null;
      note: string;
    },
  ) => request<{ licenses: SoftwareLicense[] }>(`/api/software/${id}/renew`, "POST", term),

  bonus: () => request<BonusData>("/api/compensation/bonus"),
  saveBonus: (plan: BonusPlan) => request<BonusData>("/api/compensation/bonus", "PUT", plan),
  /** Records that the bonus table is about to be downloaded. */
  logBonusExport: (rows: number) =>
    request<{ ok: true }>("/api/compensation/audit", "POST", { event: "bonus-export", rows }),

  compensationLock: () => request<{ hasPassword: boolean; unlocked: boolean }>("/api/compensation/lock"),
  unlockCompensation: (password: string) =>
    request<{ ok: true }>("/api/compensation/lock", "POST", { action: "unlock", password }),
  setupCompensationPassword: (loginPassword: string, newPassword: string) =>
    request<{ ok: true }>("/api/compensation/lock", "POST", { action: "setup", loginPassword, newPassword }),
  changeCompensationPassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("/api/compensation/lock", "POST", {
      action: "change",
      currentPassword,
      newPassword,
    }),
  lockCompensation: () => request<{ ok: true }>("/api/compensation/lock", "POST", { action: "lock" }),

  merit: () => request<MeritData>("/api/compensation/merit"),
  saveMerit: (plan: MeritPlan) => request<MeritData>("/api/compensation/merit", "PUT", plan),

  saveLevel: (level: JobLevel) => request<{ level: JobLevel }>("/api/levels", "PUT", level),
  deleteLevel: (level: Pick<JobLevel, "departmentId" | "level">) =>
    request<{ ok: true }>("/api/levels", "DELETE", level),
};

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
