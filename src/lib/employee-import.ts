import { APPRAISAL_TYPES, DEPARTMENTS } from "./constants";
import type { ImportLine } from "./salary-import";
import type { ImportedEmployee, JobLevel, User } from "./types";

/**
 * Turning a line of the employee workbook into a person for the system: used by the salary
 * import (MD) and the employee import (admin), so both follow the same rules.
 */

/** Someone already in the system, as far as an import needs to know. */
export type Person = Pick<
  User,
  "id" | "code" | "name" | "role" | "position" | "team" | "departmentId" | "supervisorId"
>;

/** Where a new person's supervisor came from; "" when none could be found. */
export type SupervisorFrom = "picked" | "file" | "auto" | "";

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

/**
 * A new person from a line, or what is missing to make one. The supervisor is the one picked on
 * screen, else the code in the file, else whom the department usually reports to. When only the
 * supervisor is missing the person is still returned (with no supervisor), so one can be picked.
 */
export function newEmployeeFrom(
  line: ImportLine,
  context: { directory: Person[]; levels: JobLevel[]; fileCodes: Set<string>; picked?: string },
): { employee: ImportedEmployee | null; problems: string[]; supervisorFrom: SupervisorFrom } {
  const { directory, levels, fileCodes, picked } = context;
  const problems: string[] = [];
  if (!/^\d{5}$/.test(line.code)) problems.push("รหัสต้องเป็นตัวเลข 5 หลัก");
  if (!line.thaiName) problems.push("ไม่มีชื่อ");
  const role = squash(line.role);
  const roleOf =
    role === "" || role === "พนักงาน" || role === "employee"
      ? "employee"
      : role === "หัวหน้า" || role === "ผู้ประเมิน" || role === "supervisor"
        ? "supervisor"
        : null;
  if (!roleOf) {
    problems.push(
      role === "admin" || role === "แอดมิน"
        ? "นำเข้าสิทธิ์ Admin ไม่ได้ (IT ตั้งในหน้าข้อมูลพนักงาน)"
        : `ไม่รู้จักสิทธิ์ ${line.role}`,
    );
  }
  const { department, level } = departmentAndLevel(line, levels);
  if (!department) problems.push(line.department ? `ไม่พบฝ่าย ${line.department}` : "ไม่มีฝ่าย");
  if (department && !level)
    problems.push(line.levelName ? `ไม่พบ ${line.levelName} ในฝ่ายนี้` : "ไม่มี Level");

  const codes = new Set(directory.map((person) => person.code));
  const known = (code: string) => code !== "" && (codes.has(code) || fileCodes.has(code));
  const fromFile = supervisorCodeOf(line.supervisor);
  const fileOk = known(fromFile);
  const auto = department ? usualSupervisor(directory, department.id, line.team) : "";
  const supervisorCode = picked ?? (fileOk ? fromFile : auto);
  const supervisorFrom: SupervisorFrom = picked ? "picked" : fileOk ? "file" : auto ? "auto" : "";
  if (!known(supervisorCode)) problems.push("ยังไม่มีหัวหน้า: เลือกจากรายการ");

  const build = (supervisor: string): ImportedEmployee | null =>
    roleOf && department && level
      ? {
          code: line.code,
          name: line.thaiName,
          nickname: line.nickname,
          role: roleOf,
          departmentId: department.id,
          level: level.level,
          supervisorCode: supervisor,
          position: line.position,
          team: line.team,
          startDate: line.startDate,
          levelSince: line.levelSince,
          birthDate: line.birthDate,
          appraisalType: appraisalTypeOf(line.appraisalType),
        }
      : null;
  if (problems.length === 0) return { employee: build(supervisorCode), problems, supervisorFrom };
  const onlySupervisor = problems.length === 1 && !known(supervisorCode);
  return { employee: onlySupervisor ? build("") : null, problems, supervisorFrom };
}

/** Who can be picked as a supervisor: anyone who is not a plain employee or already leads someone. */
export function supervisorChoices(directory: Person[]): { code: string; label: string }[] {
  return directory
    .filter(
      (person) => person.role !== "employee" || directory.some((other) => other.supervisorId === person.id),
    )
    .map((person) => ({ code: person.code, label: `${person.name} (${person.code})` }));
}
