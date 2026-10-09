import "server-only";
import {
  ALL_SECTIONS,
  APPRAISAL_TYPES,
  DEPARTMENTS,
  EXPECTED_LEVELS,
  WEIGHTED_SECTIONS,
} from "../constants";
import { validateTemplate } from "../evaluation";
import type {
  DepartmentId,
  EmployeeInput,
  ExpectedLevel,
  FormTemplate,
  JobLevel,
  Level,
  Question,
  Role,
  SectionKey,
  Weights,
} from "../types";
import { HttpError } from "./errors";

/** Turns untrusted request bodies into well-formed records, or rejects them with a 400. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROLES: Role[] = ["employee", "supervisor", "admin"];

const trimmed = (value: unknown, max = 200): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function departmentOf(value: unknown): DepartmentId | null {
  return DEPARTMENTS.find((d) => d.id === value)?.id ?? null;
}

function levelOf(value: unknown): Level | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 99
    ? value
    : null;
}

export function parseJobLevel(body: Record<string, unknown>): JobLevel {
  const departmentId = departmentOf(body.departmentId);
  const level = levelOf(body.level);
  if (!departmentId || !level) throw new HttpError(400, "ฝ่ายหรือ Level ไม่ถูกต้อง");
  const name = trimmed(body.name, 60);
  if (!name) throw new HttpError(400, "กรุณากรอกชื่อระดับ");
  return { departmentId, level, name, title: trimmed(body.title) };
}

function dateOf(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${label}ไม่ถูกต้อง`);
  }
  return value;
}

export function parseEmployeeInput(body: Record<string, unknown>): EmployeeInput {
  const code = trimmed(body.code);
  if (!/^\d{5}$/.test(code)) throw new HttpError(400, "รหัสพนักงานต้องเป็นตัวเลข 5 หลัก");

  const name = trimmed(body.name);
  if (!name) throw new HttpError(400, "กรุณากรอกชื่อ-สกุล");

  const role = ROLES.find((r) => r === body.role);
  if (!role) throw new HttpError(400, "กรุณาเลือกสิทธิ์การใช้งาน");

  const supervisorId = body.supervisorId ? String(body.supervisorId) : null;
  if (supervisorId && !UUID.test(supervisorId)) throw new HttpError(400, "ผู้ประเมินไม่ถูกต้อง");

  return {
    code,
    name,
    nickname: trimmed(body.nickname, 60),
    role,
    position: trimmed(body.position),
    team: trimmed(body.team),
    departmentId: departmentOf(body.departmentId),
    level: levelOf(body.level),
    supervisorId,
    startDate: dateOf(body.startDate, "วันเริ่มงาน"),
    levelSince: dateOf(body.levelSince, "วันที่เริ่มระดับปัจจุบัน"),
    appraisalType: APPRAISAL_TYPES.find((t) => t === body.appraisalType) ?? "Annual",
  };
}

function parseQuestions(value: unknown): Question[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const id = trimmed(raw.id, 80);
    if (!id) return [];
    const question: Question = {
      id,
      title: trimmed(raw.title, 200),
      description: trimmed(raw.description, 1000),
    };
    if (typeof raw.target === "string") question.target = trimmed(raw.target, 200);
    if (typeof raw.note === "string") question.note = trimmed(raw.note, 500);
    const expected = EXPECTED_LEVELS.find((l) => l === raw.expectedLevel) as ExpectedLevel | undefined;
    if (expected) question.expectedLevel = expected;
    return [question];
  });
}

export function parseTemplate(body: Record<string, unknown>): FormTemplate {
  const departmentId = departmentOf(body.departmentId);
  const level = levelOf(body.level);
  if (!departmentId || !level) throw new HttpError(400, "ฝ่ายหรือ Level ไม่ถูกต้อง");

  const rawWeights = (body.weights ?? {}) as Record<string, unknown>;
  const weights = Object.fromEntries(
    WEIGHTED_SECTIONS.map((key) => {
      const value = Number(rawWeights[key]);
      return [key, Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0];
    }),
  ) as Weights;

  const rawSections = (body.sections ?? {}) as Record<string, unknown>;
  const sections = Object.fromEntries(
    ALL_SECTIONS.map((key) => [key, parseQuestions(rawSections[key])]),
  ) as Record<SectionKey, Question[]>;

  const template: FormTemplate = { departmentId, level, weights, sections, updatedAt: null };

  const ids = ALL_SECTIONS.flatMap((key) => sections[key].map((q) => q.id));
  if (new Set(ids).size !== ids.length) throw new HttpError(400, "มีรหัสข้อประเมินซ้ำกัน");

  const problem = validateTemplate(template);
  if (problem) throw new HttpError(400, problem);
  return template;
}
