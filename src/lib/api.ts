import type {
  Cycle,
  EmployeeInput,
  Evaluation,
  EvaluationAction,
  EvaluationBundle,
  FormTemplate,
  JobLevel,
  OverviewData,
  Scales,
  User,
} from "./types";

/** Browser-side client for the app's own API routes. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

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
  overview: (cycleId: string | null = null) =>
    request<OverviewData>(`/api/overview${cycleQuery(cycleId)}`),

  evaluation: (employeeId: string, cycleId: string | null = null) =>
    request<EvaluationBundle>(`/api/evaluations/${employeeId}${cycleQuery(cycleId)}`),
  updateEvaluation: (employeeId: string, evaluation: Evaluation, action: EvaluationAction) =>
    request<EvaluationBundle>(`/api/evaluations/${employeeId}`, "PUT", { evaluation, action }),

  /** Admin only: deletes the form of the current cycle so the employee starts again. */
  clearEvaluation: (employeeId: string) =>
    request<{ ok: true }>(`/api/evaluations/${employeeId}`, "DELETE"),

  templates: () => request<{ levels: JobLevel[]; templates: FormTemplate[] }>("/api/templates"),
  saveTemplate: (template: FormTemplate) =>
    request<{ template: FormTemplate }>("/api/templates", "PUT", template),

  createEmployee: (input: EmployeeInput, password: string) =>
    request<{ user: User }>("/api/employees", "POST", { ...input, password }),
  /** An empty `password` keeps the one the employee already has. */
  updateEmployee: (id: string, input: EmployeeInput, password: string) =>
    request<{ user: User }>(`/api/employees/${id}`, "PUT", { ...input, password }),
  deleteEmployee: (id: string) => request<{ ok: true }>(`/api/employees/${id}`, "DELETE"),

  cycles: () => request<{ cycles: (Cycle & { evaluations: number })[] }>("/api/cycles"),
  createCycle: (id: string, period: string) =>
    request<{ ok: true }>("/api/cycles", "POST", { id, period }),
  updateCycle: (id: string, period: string) =>
    request<{ ok: true }>("/api/cycles", "PUT", { id, period }),
  /** Closes the open cycle and opens this one. */
  openCycle: (id: string) => request<{ ok: true }>("/api/cycles", "PUT", { id, makeCurrent: true }),
  deleteCycle: (id: string) => request<{ ok: true }>("/api/cycles", "DELETE", { id }),

  scales: () => request<{ scales: Scales }>("/api/scales"),
  saveScales: (scales: Scales) => request<{ scales: Scales }>("/api/scales", "PUT", scales),

  saveLevel: (level: JobLevel) => request<{ level: JobLevel }>("/api/levels", "PUT", level),
  deleteLevel: (level: Pick<JobLevel, "departmentId" | "level">) =>
    request<{ ok: true }>("/api/levels", "DELETE", level),
};

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
