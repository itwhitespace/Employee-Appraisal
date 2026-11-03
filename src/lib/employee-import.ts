import { APPRAISAL_TYPES, DEPARTMENTS } from "./constants";
import type { ImportLine } from "./salary-import";
import type { DepartmentId, ImportedEmployee, JobLevel, Level, Role, User } from "./types";

/**
 * Turning a line of the employee workbook into a person for the system: used by the salary
 * import (MD) and the employee import (admin), so both follow the same rules.
 */

/** Someone already in the system, as far as an import needs to know. */
export type Person = Pick<
  User,
  "id" | "code" | "name" | "role" | "position" | "team" | "departmentId" | "supervisorId"
>;

/** For comparing names of departments, levels and roles as typed in a file. */
export const squash = (text: string) => text.toLowerCase().replace(/[\s–-]+/g, "");

/** The supervisor most people of this department (and team, when it decides) report to. */
export function usualSupervisor(directory: Person[], departmentId: string, team: string): string {
  const byId = new Map(directory.map((person) => [person.id, person]));
  const mostCommon = (people: Person[]) => {
    const counts = new Map<string, number>();
    for (const person of people) {
      if (person.supervisorId) counts.set(person.supervisorId, (counts.get(person.supervisorId) ?? 0) + 1);
    }
    const [id] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
    return id ? (byId.get(id)?.code ?? "") : "";
  };
  // Only ordinary staff vote: a team lead's own boss is not who the team reports to.
  const inDepartment = directory.filter(
    (person) => person.departmentId === departmentId && person.role === "employee",
  );
  const inTeam = team ? inDepartment.filter((person) => squash(person.team) === squash(team)) : [];
  return mostCommon(inTeam) || mostCommon(inDepartment);
}

/** The department and level a line names, when both exist. */
export function departmentAndLevel(line: ImportLine, levels: JobLevel[]) {
  const department = DEPARTMENTS.find(
    (d) => squash(d.name) === squash(line.department) || d.id === line.department,
  );
  const level = department
    ? levels.find((l) => l.departmentId === department.id && squash(l.name) === squash(line.levelName))
    : undefined;
  return { department, level };
}

/** A supervisor's code as written in the file: "ชื่อ (10401)" or just "10401". */
export const supervisorCodeOf = (text: string) =>
  text.match(/\((\d{5})\)/)?.[1] ?? text.match(/^\d{5}$/)?.[0] ?? "";

export const appraisalTypeOf = (text: string) =>
  APPRAISAL_TYPES.find((t) => squash(t) === squash(text)) ?? "Annual";

/** A new person as filled in on the import page: department and level may still be missing. */
export type NewPersonForm = Omit<ImportedEmployee, "departmentId" | "level"> & {
  departmentId: DepartmentId | null;
  level: Level | null;
};

const roleOf = (text: string): Role => {
  const role = squash(text);
  if (role === "admin" || role === "แอดมิน") return "admin";
  if (role === "หัวหน้า" || role === "ผู้ประเมิน" || role === "supervisor") return "supervisor";
  return "employee";
};

/**
 * What the file says about someone not in the system, to start the form with. The supervisor
 * is the code in the file when it is known, else whom the department usually reports to.
 */
export function draftFrom(line: ImportLine, directory: Person[], levels: JobLevel[]): NewPersonForm {
  const { department, level } = departmentAndLevel(line, levels);
  const codes = new Set(directory.map((person) => person.code));
  const fromFile = supervisorCodeOf(line.supervisor);
  return {
    code: /^\d{5}$/.test(line.code) ? line.code : "",
    name: line.thaiName,
    nickname: line.nickname,
    role: line.role ? roleOf(line.role) : "employee",
    departmentId: department?.id ?? null,
    level: level?.level ?? null,
    supervisorCode: codes.has(fromFile)
      ? fromFile
      : department
        ? usualSupervisor(directory, department.id, line.team)
        : "",
    password: "",
    position: line.position,
    team: line.team,
    startDate: line.startDate,
    levelSince: line.levelSince,
    birthDate: line.birthDate,
    appraisalType: appraisalTypeOf(line.appraisalType),
  };
}

/**
 * What still stops the person from being added; empty when the form is complete.
 * `takenCodes`: codes in the system and of the other new people of this import.
 * `supervisorCodes`: who may be named as the supervisor.
 */
export function draftProblems(
  form: NewPersonForm,
  {
    levels,
    takenCodes,
    supervisorCodes,
  }: { levels: JobLevel[]; takenCodes: Set<string>; supervisorCodes: Set<string> },
): Partial<Record<"code" | "name" | "departmentId" | "level" | "supervisorCode" | "password", string>> {
  const problems: ReturnType<typeof draftProblems> = {};
  if (!/^\d{5}$/.test(form.code)) problems.code = "รหัสต้องเป็นตัวเลข 5 หลัก";
  else if (takenCodes.has(form.code)) problems.code = `รหัส ${form.code} มีอยู่แล้ว`;
  if (!form.name.trim()) problems.name = "กรุณากรอกชื่อ-สกุล";
  if (!form.departmentId) problems.departmentId = "กรุณาเลือกฝ่าย";
  if (!form.level || !levels.some((l) => l.departmentId === form.departmentId && l.level === form.level))
    problems.level = "กรุณาเลือก Level";
  if (form.supervisorCode === form.code && form.code) problems.supervisorCode = "เป็นหัวหน้าของตัวเองไม่ได้";
  else if (form.supervisorCode ? !supervisorCodes.has(form.supervisorCode) : form.role !== "admin")
    problems.supervisorCode = "กรุณาเลือกหัวหน้า";
  if (form.password && !/^\d{5}$/.test(form.password)) problems.password = "ต้องเป็นตัวเลข 5 หลัก";
  return problems;
}

/** Who can be picked as a supervisor: anyone who is not a plain employee or already leads someone. */
export function supervisorChoices(directory: Person[]): { code: string; label: string }[] {
  return directory
    .filter(
      (person) => person.role !== "employee" || directory.some((other) => other.supervisorId === person.id),
    )
    .map((person) => ({ code: person.code, label: `${person.name} (${person.code})` }));
}
