import "server-only";
import type { EmployeeInput, JobLevel, User } from "../types";
import { createUser, updateUser } from "./db";
import { HttpError } from "./errors";
import { hashPassword } from "./password";
import { parseEmployeeInput, parsePassword } from "./validate";

/**
 * People added and changed from an Excel file, shared by the salary import (MD) and the
 * employee import (admin). Everything is checked first (`check…`), then written (`create…`,
 * `apply…`), so a bad line stops the whole import before anything is saved.
 */

export const asObject = (value: unknown) =>
  (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
export const asList = (value: unknown) => (Array.isArray(value) ? value : []);
export const text = (value: unknown, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export interface NewPersonDraft {
  input: EmployeeInput;
  /** "" only for admin, who may report to no one. */
  supervisorCode: string;
  passwordHash: string | null;
}

/**
 * People new to the system, as filled in on the import page: any role, never with
 * compensation access (granted only in the database). Without a password they cannot sign in
 * until admin sets one.
 */
export function checkNewEmployees(value: unknown, users: User[], levels: JobLevel[]): NewPersonDraft[] {
  const byCode = new Set(users.map((u) => u.code));
  const rawNew = asList(value).slice(0, 500).map(asObject);
  const newCodes = new Set<string>();
  return rawNew.map((raw) => {
    const input = parseEmployeeInput({ ...raw, supervisorId: null });
    const password = parsePassword(raw);
    if (byCode.has(input.code)) throw new HttpError(409, `รหัสพนักงาน ${input.code} มีอยู่ในระบบแล้ว`);
    if (newCodes.has(input.code)) throw new HttpError(400, `รหัส ${input.code} ซ้ำกันในไฟล์`);
    newCodes.add(input.code);
    if (!input.departmentId || !input.level)
      throw new HttpError(400, `${input.name}: กรุณาระบุฝ่ายและ Level`);
    if (!levels.some((l) => l.departmentId === input.departmentId && l.level === input.level)) {
      throw new HttpError(400, `${input.name}: ไม่พบ Level นี้ในฝ่ายที่ระบุ`);
    }
    const supervisorCode = text(raw.supervisorCode, 5);
    const bossFree = supervisorCode === "" && input.role === "admin";
    if (supervisorCode === input.code) throw new HttpError(400, `${input.name}: เป็นหัวหน้าของตัวเองไม่ได้`);
    if (
      !bossFree &&
      !byCode.has(supervisorCode) &&
      !rawNew.some((other) => text(other.code, 5) === supervisorCode)
    ) {
      throw new HttpError(400, `${input.name}: ไม่พบหัวหน้ารหัส ${supervisorCode || "–"}`);
    }
    return { input, supervisorCode, passwordHash: password ? hashPassword(password) : null };
  });
}

/** Creates the people, supervisors before those who report to them. Returns their ids by code. */
export async function createNewEmployees(
  drafts: NewPersonDraft[],
  users: User[],
): Promise<Map<string, string>> {
  const byCode = new Map(users.map((u) => [u.code, u.id]));
  const created = new Map<string, string>();
  const idOf = (code: string) => created.get(code) ?? byCode.get(code) ?? null;
  let pending = drafts;
  while (pending.length) {
    const ready = pending.filter((d) => d.supervisorCode === "" || idOf(d.supervisorCode));
    if (ready.length === 0) {
      throw new HttpError(400, "หัวหน้าของพนักงานใหม่อ้างถึงกันเป็นวง กรุณาตรวจคอลัมน์หัวหน้า");
    }
    for (const draft of ready) {
      const supervisorId = draft.supervisorCode ? idOf(draft.supervisorCode) : null;
      const input: EmployeeInput = { ...draft.input, supervisorId };
      created.set(input.code, (await createUser(input, draft.passwordHash)).id);
    }
    pending = pending.filter((d) => !ready.includes(d));
  }
  return created;
}

/** Fields of someone already in the system that the employee import may change. */
const CHANGEABLE = [
  "nickname",
  "position",
  "team",
  "departmentId",
  "level",
  "supervisorCode",
  "startDate",
  "levelSince",
  "birthDate",
  "appraisalType",
] as const;

export interface PersonUpdate {
  user: User;
  input: EmployeeInput;
}

/**
 * Changes to people already in the system: `{ employeeId, changes }` with any of CHANGEABLE.
 * Name, code and role are never changed here. The result goes through the same checks as the
 * employee form; new people of the same import may be named as supervisors.
 */
export function checkEmployeeUpdates(
  value: unknown,
  users: User[],
  newCodes: Set<string>,
): {
  updates: PersonUpdate[];
  supervisorCodes: Map<string, string>;
} {
  const byCode = new Map(users.map((u) => [u.code, u]));
  const supervisorCodes = new Map<string, string>();
  const updates = asList(value)
    .slice(0, 1000)
    .map(asObject)
    .map((raw): PersonUpdate => {
      const user = users.find((u) => u.id === raw.employeeId);
      if (!user) throw new HttpError(400, "มีพนักงานที่ไม่พบในระบบ กรุณาโหลดหน้าใหม่");
      const changes = asObject(raw.changes);
      const merged: Record<string, unknown> = { ...user };
      for (const key of CHANGEABLE) if (key in changes) merged[key] = changes[key];
      if ("supervisorCode" in changes) {
        const code = text(changes.supervisorCode, 5);
        if (code === user.code) throw new HttpError(400, `${user.name}: เป็นหัวหน้าของตัวเองไม่ได้`);
        if (!byCode.has(code) && !newCodes.has(code)) {
          throw new HttpError(400, `${user.name}: ไม่พบหัวหน้ารหัส ${code || "–"}`);
        }
        merged.supervisorId = byCode.get(code)?.id ?? null;
        if (newCodes.has(code)) supervisorCodes.set(user.id, code);
      }
      // Role and code stay as they are; parseEmployeeInput checks the rest like the employee form.
      const input = parseEmployeeInput({ ...merged, role: user.role, code: user.code, name: user.name });
      return { user, input };
    });
  return { updates, supervisorCodes };
}

/** Writes the changes; a supervisor who is new in the same import is looked up by code. */
export async function applyEmployeeUpdates(
  updates: PersonUpdate[],
  supervisorCodes: Map<string, string>,
  created: Map<string, string>,
): Promise<void> {
  for (const { user, input } of updates) {
    const newSupervisor = supervisorCodes.get(user.id);
    const supervisorId = newSupervisor ? (created.get(newSupervisor) ?? null) : input.supervisorId;
    await updateUser(user.id, { ...input, supervisorId }, null);
  }
}
