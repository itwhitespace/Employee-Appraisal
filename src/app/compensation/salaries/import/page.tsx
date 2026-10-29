"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { today } from "@/components/CompensationParts";
import { useConfirm } from "@/components/ConfirmDialog";
import { useLeaveGuard } from "@/components/useLeaveGuard";
import { api, errorMessage } from "@/lib/api";
import { baht } from "@/lib/compensation";
import { APPRAISAL_TYPES, DEPARTMENTS } from "@/lib/constants";
import { displayName } from "@/lib/format";
import { ImportError, type ImportMatch, matchLines, nameKey, readSalaryWorkbook } from "@/lib/salary-import";
import type { CompensationOverview, CompensationRow, ImportedEmployee, SalaryImport } from "@/lib/types";

type Status = "missing" | "new" | "check" | "update" | "same";

const STATUS: Record<Status, { label: string; tone: string; order: number }> = {
  missing: { label: "ไม่พบ / ข้อมูลไม่ครบ", tone: "bg-red-50 text-red-700", order: 0 },
  new: { label: "พนักงานใหม่", tone: "bg-sky-50 text-sky-700", order: 1 },
  check: { label: "ต้องตรวจ", tone: "bg-amber-50 text-amber-800", order: 2 },
  update: { label: "อัปเดต", tone: "bg-emerald-50 text-emerald-700", order: 3 },
  same: { label: "ไม่เปลี่ยน", tone: "bg-black/5 text-muted", order: 4 },
};

/** For comparing names of departments, levels and roles as typed in a file. */
const squash = (text: string) => text.toLowerCase().replace(/[\s–-]+/g, "");

interface Parsed {
  fileName: string;
  sheet: string;
  matches: ImportMatch[];
}

interface Reviewed {
  index: number;
  match: ImportMatch;
  row: CompensationRow | null;
  status: Status;
  notes: string[];
  base: number | null;
  allowance: number;
  /** A person to add to the system: a code in the file that the system does not have. */
  newEmployee: ImportedEmployee | null;
  /** Job title / team in the file that differ from the system; null = the same or not given. */
  positionChange: string | null;
  teamChange: string | null;
}

const departmentName = (row: CompensationRow) =>
  DEPARTMENTS.find((d) => d.id === row.employee.departmentId)?.name ?? "";

/** Old → new, with the new figure stressed when it changes. */
function Change({ from, to }: { from: number | null | undefined; to: number | null }) {
  if (to === null) return <span className="text-faint">–</span>;
  const changed = from !== to;
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="text-faint">{from === null || from === undefined ? "–" : baht(from)}</span>
      <span className="mx-1 text-faint">→</span>
      <span className={changed ? "font-semibold text-teal-800" : "text-muted"}>{baht(to)}</span>
    </span>
  );
}

/**
 * A job title or team: as in the system when the file agrees, otherwise system → file with a
 * tick to take the file's. One tick per line covers both job title and team.
 */
function ProfileCell({
  file,
  change,
  from,
  ticked,
  onTick,
}: {
  file: string;
  change: string | null;
  /** The system's value; null for a person not in the system. */
  from: string | null;
  ticked: boolean;
  onTick: (value: boolean) => void;
}) {
  if (from === null || change === null) {
    return <span className={file ? "" : "text-faint"}>{file || from || "–"}</span>;
  }
  return (
    <div>
      <div className="text-[11px] text-faint line-through">{from || "(ว่าง)"}</div>
      <div className="font-medium text-amber-800">{change}</div>
      <label className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted">
        <input type="checkbox" checked={ticked} onChange={(e) => onTick(e.target.checked)} />
        อัปเดต
      </label>
    </div>
  );
}

export default function SalaryImportPage() {
  const confirm = useConfirm();
  const [data, setData] = useState<CompensationOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  /** Employee picked by hand per line; "" = none. */
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  /** Lines whose job title and team are to replace the system's. */
  const [profileTicked, setProfileTicked] = useState<Record<number, boolean>>({});
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useLeaveGuard(parsed !== null && done === null);

  useEffect(() => {
    api
      .salaries()
      .then(setData)
      .catch((e) => setLoadError(errorMessage(e)));
  }, []);

  if (loadError) return <div className="card p-8 text-center text-red-500">{loadError}</div>;
  if (!data) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const rowsById = new Map(data.rows.map((row) => [row.employee.id, row]));
  const directoryCodes = new Map(data.directory.map((person) => [person.code, person]));

  /** A new person from a line of the employee export, or what is missing to make one. */
  const newEmployeeOf = (
    line: ImportMatch["line"],
    fileCodes: Set<string>,
  ): { employee: ImportedEmployee | null; problems: string[] } => {
    const problems: string[] = [];
    if (!/^\d{5}$/.test(line.code)) problems.push("รหัสต้องเป็นตัวเลข 5 หลัก");
    if (!line.thaiName) problems.push("ไม่มีชื่อ");
    const role = squash(line.role);
    const roleOf =
      role === "" || role === "พนักงาน" || role === "employee"
        ? "employee"
        : role === "หัวหน้า" || role === "supervisor"
          ? "supervisor"
          : null;
    if (!roleOf) {
      problems.push(
        role === "admin"
          ? "นำเข้าสิทธิ์ Admin ไม่ได้ (IT ตั้งในหน้าข้อมูลพนักงาน)"
          : `ไม่รู้จักสิทธิ์ ${line.role}`,
      );
    }
    const department = DEPARTMENTS.find(
      (d) => squash(d.name) === squash(line.department) || d.id === line.department,
    );
    if (!department) problems.push(line.department ? `ไม่พบฝ่าย ${line.department}` : "ไม่มีฝ่าย");
    const level = department
      ? data.levels.find((l) => l.departmentId === department.id && squash(l.name) === squash(line.levelName))
      : undefined;
    if (department && !level)
      problems.push(line.levelName ? `ไม่พบ ${line.levelName} ในฝ่ายนี้` : "ไม่มี Level");
    const supervisorCode =
      line.supervisor.match(/\((\d{5})\)/)?.[1] ?? line.supervisor.match(/^\d{5}$/)?.[0] ?? "";
    if (!supervisorCode) problems.push("ไม่มีรหัสหัวหน้า (เช่น ชื่อ (10401))");
    else if (!directoryCodes.has(supervisorCode) && !fileCodes.has(supervisorCode)) {
      problems.push(`ไม่พบหัวหน้ารหัส ${supervisorCode}`);
    }
    if (problems.length || !roleOf || !department || !level) return { employee: null, problems };
    return {
      employee: {
        code: line.code,
        name: line.thaiName,
        nickname: line.nickname,
        role: roleOf,
        departmentId: department.id,
        level: level.level,
        supervisorCode,
        position: line.position,
        team: line.team,
        startDate: line.startDate,
        levelSince: line.levelSince,
        appraisalType: APPRAISAL_TYPES.find((t) => squash(t) === squash(line.appraisalType)) ?? "Annual",
      },
      problems,
    };
  };
  const gradeOf = (row: CompensationRow) => data.structure.grades.find((g) => g.grade === row.grade);

  const review = (matches: ImportMatch[], choices: Record<number, string>): Reviewed[] => {
    const chosen = matches.map((match, index) =>
      choices[index] !== undefined ? (rowsById.get(choices[index]) ?? null) : match.row,
    );
    const uses = new Map<string, number>();
    for (const row of chosen) if (row) uses.set(row.employee.id, (uses.get(row.employee.id) ?? 0) + 1);

    // Codes of people the file adds, so one can be the supervisor of another.
    const fileCodes = new Set(
      matches.flatMap((m, i) => (m.kind === "unknownCode" && choices[i] === undefined ? [m.line.code] : [])),
    );

    return matches.map((match, index): Reviewed => {
      const row = chosen[index];
      const { line } = match;
      const base = line.baseSalary;
      const allowance = line.allowance ?? 0;
      const notes: string[] = [];
      const fresh = { newEmployee: null, positionChange: null, teamChange: null };
      if (!row && match.kind === "unknownCode" && choices[index] === undefined) {
        const known = directoryCodes.get(line.code);
        if (known) {
          notes.push(
            `รหัส ${line.code} (${known.name}) มีในระบบแต่ยังไม่มีฝ่าย / Level / หัวหน้า · ให้ IT เพิ่มในหน้าข้อมูลพนักงานก่อน`,
          );
          return { index, match, row, status: "missing", notes, base, allowance, ...fresh };
        }
        const { employee, problems } = newEmployeeOf(line, fileCodes);
        if (!employee) {
          notes.push(`ไม่พบรหัส ${line.code} ในระบบ · เพิ่มเป็นพนักงานใหม่ไม่ได้: ${problems.join(", ")}`);
          return { index, match, row, status: "missing", notes, base, allowance, ...fresh };
        }
        notes.push("เพิ่มเป็นพนักงานใหม่ (ยังไม่มีรหัสผ่าน เข้าระบบไม่ได้จนกว่า IT จะตั้งให้)");
        if (base === null || base <= 0) notes.push("ไม่มี base salary ในไฟล์: เพิ่มเฉพาะข้อมูลพนักงาน");
        return { index, match, row, status: "new", notes, base, allowance, ...fresh, newEmployee: employee };
      }
      if (!row) {
        notes.push(
          match.kind === "unknownCode"
            ? `ไม่พบรหัส ${line.code} ในระบบ (หรือไม่มีแบบประเมิน) เลือกเองหรือข้าม`
            : match.kind === "ambiguous"
              ? "ชื่อตรงกับหลายคน เลือกเอง"
              : "ไม่พบชื่อนี้ในระบบ เลือกเองหรือข้าม",
        );
        return { index, match, row, status: "missing", notes, base, allowance, ...fresh };
      }
      // Job title and team: offered for update when the file says something else.
      const person = directoryCodes.get(row.employee.code);
      const changes = {
        newEmployee: null,
        positionChange: line.position && line.position !== (person?.position ?? "") ? line.position : null,
        teamChange: line.team && line.team !== (person?.team ?? "") ? line.team : null,
      };
      if (base === null || base <= 0) {
        notes.push("ไม่มี base salary ในไฟล์");
        return { index, match, row, status: "missing", notes, base, allowance, ...changes };
      }
      if (choices[index] !== undefined) notes.push("เลือกพนักงานเอง");
      else if (match.kind === "english") notes.push("จับคู่ด้วยชื่ออังกฤษ");
      // Matched by code: the name in the file should still be the same person.
      const otherName =
        match.kind === "code" &&
        choices[index] === undefined &&
        nameKey(line.thaiName) !== "" &&
        nameKey(line.thaiName) !== nameKey(row.employee.name);
      if (otherName) notes.push(`ชื่อในไฟล์ไม่ตรงกับรหัส ${line.code}`);
      else if (match.kind === "nickname") notes.push("จับคู่ด้วยชื่อเล่น");
      if ((uses.get(row.employee.id) ?? 0) > 1) notes.push("ซ้ำกับแถวอื่นในไฟล์");
      const systemLevel = gradeOf(row)?.jobLevel ?? "";
      if (line.jobLevel && systemLevel && line.jobLevel.toLowerCase() !== systemLevel.toLowerCase()) {
        notes.push(`Job level ในไฟล์ ${line.jobLevel} · ในระบบ ${systemLevel}`);
      }
      if (line.random) notes.push("ตัวเลขในไฟล์มาจากสูตรสุ่ม อาจไม่ตรงกับที่เห็นใน Excel");
      const same = row.salary?.baseSalary === base && row.salary?.allowance === allowance;
      const unsure =
        line.random ||
        match.kind === "nickname" ||
        otherName ||
        (uses.get(row.employee.id) ?? 0) > 1 ||
        notes.some((n) => n.startsWith("Job"));
      const status: Status = same ? "same" : unsure ? "check" : "update";
      if (same) notes.unshift("ตรงกับข้อมูลปัจจุบัน");
      return { index, match, row, status, notes, base, allowance, ...changes };
    });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    setDone(null);
    setReading(true);
    try {
      const { sheet, lines } = await readSalaryWorkbook(file);
      const matches = matchLines(lines, data.rows);
      // Only the clear-cut changes start ticked; anything unsure waits for a look.
      const first = review(matches, {});
      setParsed({ fileName: file.name, sheet, matches });
      setPicked({});
      setProfileTicked({});
      // New people wait for a tick too: adding someone to the system is a choice.
      setTicked(Object.fromEntries(first.map((r) => [r.index, r.status === "update"])));
      setNote(`นำเข้าจาก ${file.name}`);
    } catch (e) {
      setParsed(null);
      setFileError(e instanceof ImportError ? e.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setReading(false);
    }
  };

  const reviewed = parsed ? review(parsed.matches, picked) : [];
  const randomLines = parsed ? parsed.matches.filter((m) => m.line.random).length : 0;
  const formulaLines = parsed ? parsed.matches.filter((m) => m.line.formula).length : 0;
  const counts = (Object.keys(STATUS) as Status[]).map((status) => ({
    status,
    count: reviewed.filter((r) => r.status === status).length,
  }));
  const selectable = (r: Reviewed) =>
    r.status === "new" || (r.row !== null && r.base !== null && r.base > 0 && r.status !== "same");
  const chosen = reviewed.filter((r) => ticked[r.index] && selectable(r));
  const existing = chosen.filter((r) => r.row !== null);
  const duplicateChosen = new Set(existing.map((r) => r.row!.employee.id)).size !== existing.length;
  const profileChosen = reviewed.filter(
    (r) => r.row !== null && profileTicked[r.index] && (r.positionChange !== null || r.teamChange !== null),
  );
  const newChosen = chosen.filter((r) => r.newEmployee !== null);
  const salaryChosen = chosen.filter((r) => r.base !== null && r.base > 0);
  const actions = chosen.length + profileChosen.length;
  const matchedIds = new Set(reviewed.flatMap((r) => (r.row ? [r.row.employee.id] : [])));
  const notInFile = data.rows.filter((row) => !matchedIds.has(row.employee.id));
  const sorted = [...reviewed].sort(
    (a, b) =>
      STATUS[a.status].order - STATUS[b.status].order || a.match.line.sheetRow - b.match.line.sheetRow,
  );

  const pick = (index: number, employeeId: string) => {
    const next = { ...picked, [index]: employeeId };
    setPicked(next);
    setTicked({ ...ticked, [index]: employeeId !== "" });
    setProfileTicked({ ...profileTicked, [index]: false });
  };

  const save = async () => {
    if (!effectiveDate) return;
    const parts = [
      newChosen.length ? `เพิ่มพนักงานใหม่ ${newChosen.length} คน (ยังไม่มีรหัสผ่าน)` : "",
      profileChosen.length ? `แก้ตำแหน่ง / ทีม ${profileChosen.length} คน` : "",
      salaryChosen.length ? `เงินเดือน ${salaryChosen.length} คน มีผลวันที่ ${effectiveDate}` : "",
    ].filter(Boolean);
    const agreed = await confirm({
      title: "นำเข้าข้อมูลจาก Excel?",
      message: `${parts.join(" · ")} · ประวัติเงินเดือนเดิมยังอยู่ ถ้ามีรายการวันเดียวกันอยู่แล้วจะถูกแก้ไข`,
      confirmLabel: "นำเข้า",
    });
    if (!agreed) return;
    setSaving(true);
    try {
      const payload: SalaryImport = {
        effectiveDate,
        note,
        newEmployees: newChosen.map((r) => r.newEmployee!),
        profileUpdates: profileChosen.map((r) => ({
          employeeId: r.row!.employee.id,
          ...(r.positionChange !== null ? { position: r.positionChange } : {}),
          ...(r.teamChange !== null ? { team: r.teamChange } : {}),
        })),
        items: salaryChosen.map((r) => ({
          ...(r.row ? { employeeId: r.row.employee.id } : { newCode: r.newEmployee!.code }),
          baseSalary: r.base!,
          allowance: r.allowance,
        })),
      };
      const overview = await api.importSalaries(payload);
      setData(overview);
      setDone(`นำเข้าแล้ว: ${parts.join(" · ")}`);
      setParsed(null);
    } catch (e) {
      setFileError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/compensation/salaries" className="text-sm text-teal-700 hover:underline">
            ← ฐานเงินเดือนพนักงาน
          </Link>
          <h1 className="page-title mt-1">นำเข้าเงินเดือนจาก Excel</h1>
          <p className="mt-1 text-sm text-muted">
            อ่านชีท raw data · จับคู่ด้วยรหัสพนักงาน (ถ้าไฟล์มีคอลัมน์ รหัส) ไม่มีรหัสจึงใช้ชื่อภาษาไทย
            ชื่ออังกฤษ หรือชื่อเล่น · นำเข้า base salary และ allowance ·
            รหัสที่ยังไม่มีในระบบเพิ่มเป็นพนักงานใหม่ได้ · ตำแหน่ง / ทีมที่ไม่ตรงเลือกอัปเดตได้
          </p>
        </div>
      </div>

      {reading && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
        >
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white px-12 py-9 shadow-float">
            <span className="h-12 w-12 animate-spin rounded-full border-4 border-teal-100 border-t-teal-600" />
            <span className="text-2xl font-semibold text-teal-900">กำลังอ่านไฟล์…</span>
            <span className="text-sm text-muted">ไฟล์ใหญ่อาจใช้เวลาสักครู่</span>
          </div>
        </div>
      )}

      <section className="card space-y-3 px-5 py-4">
        <label className="flex flex-wrap items-center gap-3">
          <span className="btn cursor-pointer rounded-lg bg-emerald-700 py-1.5 text-sm text-white hover:bg-emerald-800">
            {reading ? "กำลังอ่านไฟล์…" : "เลือกไฟล์ .xlsx"}
            <input
              type="file"
              accept=".xlsx"
              className="sr-only"
              disabled={reading}
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </span>
          {parsed && (
            <span className="text-sm text-muted">
              {parsed.fileName} · ชีท {parsed.sheet} · {parsed.matches.length} แถว
            </span>
          )}
        </label>
        <p className="text-xs text-muted">
          ไฟล์ถูกอ่านในเครื่องนี้เท่านั้น ไม่ได้อัปโหลดทั้งไฟล์ · อ่านเฉพาะคอลัมน์ รหัส, Employee Name, Name,
          Nickname, Job level, base salary, allowance · คอลัมน์อื่น เช่น เลขบัตรประชาชน
          จะไม่ถูกอ่านหรือส่งไปที่ใด · ไฟล์ .xls ให้เปิดใน Excel แล้ว Save As เป็น .xlsx ก่อน
        </p>
        {parsed && randomLines > 0 && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <p className="font-semibold">
              base salary / allowance ในไฟล์เป็นสูตรสุ่ม (เช่น RANDBETWEEN) {randomLines} แถว
            </p>
            <p className="mt-1">
              Excel สุ่มตัวเลขใหม่ทุกครั้งที่เปิดไฟล์ ตัวเลขที่ระบบอ่านได้คือค่าตอน Save ครั้งล่าสุด
              จึงไม่ตรงกับที่เห็นบนจอ · แก้: ใน Excel เลือกคอลัมน์ base salary และ allowance → คัดลอก → วางแบบ{" "}
              <b>ค่า (Paste Values)</b> → Save แล้ว Import ใหม่
            </p>
          </div>
        )}
        {parsed && randomLines === 0 && formulaLines > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            base salary / allowance ในไฟล์เป็นสูตร {formulaLines} แถว ระบบใช้ผลที่ Excel บันทึกไว้ตอน Save
            ครั้งล่าสุด · ถ้าตัวเลขในหน้านี้ไม่ตรงกับที่เห็นใน Excel ให้เปิดไฟล์แล้ว Save ใหม่ หรือวางแบบค่า
            (Paste Values) ก่อน
          </p>
        )}
        {fileError && (
          <p role="alert" className="text-sm text-red-600">
            {fileError}
          </p>
        )}
        {done && (
          <p role="status" className="text-sm font-medium text-emerald-700">
            {done} ·{" "}
            <Link href="/compensation/salaries" className="underline">
              ดูหน้าฐานเงินเดือนพนักงาน
            </Link>
          </p>
        )}
      </section>

      {parsed && (
        <>
          <div className="flex flex-wrap gap-2">
            {counts.map(({ status, count }) => (
              <span key={status} className={`chip py-1 ${STATUS[status].tone}`}>
                {STATUS[status].label} {count}
              </span>
            ))}
            <span className="chip bg-black/5 py-1 text-muted">ไม่อยู่ในไฟล์ {notInFile.length}</span>
          </div>

          <section className="card overflow-hidden">
            <header className="flex flex-wrap items-end justify-between gap-4 border-l-4 border-teal-500 px-5 py-4">
              <div>
                <h2 className="text-[17px] font-semibold tracking-tight">ตรวจสอบก่อนนำเข้า</h2>
                <p className="text-xs text-muted">
                  ติ๊กเลือกแถวที่จะนำเข้า · แถว &quot;อัปเดต&quot; ถูกเลือกไว้ให้แล้ว · แถว
                  &quot;ต้องตรวจ&quot; และ &quot;พนักงานใหม่&quot; ดูหมายเหตุก่อนติ๊ก · ตำแหน่ง / ทีมที่ไม่ตรง
                  ติ๊ก &quot;อัปเดต&quot; ใต้ค่านั้น
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">วันที่มีผล</span>
                  <input
                    type="date"
                    className="field w-40"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">หมายเหตุ</span>
                  <input
                    className="field w-64"
                    maxLength={200}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving || actions === 0 || duplicateChosen || !effectiveDate}
                  onClick={() => void save()}
                >
                  {saving ? "กำลังนำเข้า…" : `นำเข้า ${actions} รายการ`}
                </button>
              </div>
            </header>
            {duplicateChosen && (
              <p role="alert" className="border-t border-red-200 bg-red-50 px-5 py-2.5 text-sm text-red-700">
                มีพนักงานคนเดียวกันถูกเลือกมากกว่าหนึ่งแถว กรุณาเลือกเพียงแถวเดียว
              </p>
            )}
            <div className="max-h-[70vh] overflow-auto border-t border-line">
              <table className="sheet min-w-[1400px]">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="w-10 text-center">
                      <input
                        type="checkbox"
                        aria-label="เลือกทุกแถวที่อัปเดต"
                        checked={
                          chosen.length > 0 && reviewed.filter(selectable).every((r) => ticked[r.index])
                        }
                        onChange={(e) =>
                          setTicked(
                            Object.fromEntries(
                              reviewed.map((r) => [r.index, e.target.checked && selectable(r)]),
                            ),
                          )
                        }
                      />
                    </th>
                    <th className="w-14 text-center">แถว</th>
                    <th>ในไฟล์</th>
                    <th className="w-64">พนักงานในระบบ</th>
                    <th className="w-48">ตำแหน่ง</th>
                    <th className="w-36">ทีม</th>
                    <th className="text-right">Base Salary</th>
                    <th className="text-right">Allowance</th>
                    <th className="w-28 text-center">สถานะ</th>
                    <th>หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => {
                    const { line } = r.match;
                    const options = r.match.candidates.length > 1 ? r.match.candidates : data.rows;
                    return (
                      <tr key={r.index} className={r.status === "same" ? "text-muted" : ""}>
                        <td className="text-center">
                          <input
                            type="checkbox"
                            aria-label={`นำเข้าแถว ${line.sheetRow}`}
                            disabled={!selectable(r)}
                            checked={Boolean(ticked[r.index]) && selectable(r)}
                            onChange={(e) => setTicked({ ...ticked, [r.index]: e.target.checked })}
                          />
                        </td>
                        <td className="text-center tabular-nums text-faint">{line.sheetRow}</td>
                        <td>
                          <div className="font-medium">
                            {line.code && (
                              <span className="mr-1.5 tabular-nums text-teal-700">{line.code}</span>
                            )}
                            {line.thaiName || "–"}
                          </div>
                          <div className="text-[11px] text-faint">
                            {[line.englishName, line.nickname, line.jobLevel && `Job level ${line.jobLevel}`]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </td>
                        <td>
                          {r.newEmployee ? (
                            <>
                              <div className="font-medium text-sky-700">+ เพิ่มเป็นพนักงานใหม่</div>
                              <div className="text-[11px] text-faint">
                                {DEPARTMENTS.find((d) => d.id === r.newEmployee!.departmentId)?.name} ·{" "}
                                {line.levelName} · หัวหน้า {r.newEmployee.supervisorCode} ·{" "}
                                <button
                                  type="button"
                                  className="btn-text !px-0"
                                  onClick={() => pick(r.index, "")}
                                >
                                  เลือกคนเดิมแทน
                                </button>
                              </div>
                            </>
                          ) : r.match.row && picked[r.index] === undefined ? (
                            <>
                              <div>{displayName(r.match.row.employee)}</div>
                              <div className="text-[11px] text-faint">
                                {departmentName(r.match.row)} ·{" "}
                                <button
                                  type="button"
                                  className="btn-text !px-0"
                                  onClick={() =>
                                    setPicked({ ...picked, [r.index]: r.match.row!.employee.id })
                                  }
                                >
                                  เปลี่ยน
                                </button>
                              </div>
                            </>
                          ) : (
                            <select
                              className="field"
                              aria-label={`เลือกพนักงานสำหรับแถว ${line.sheetRow}`}
                              value={picked[r.index] ?? ""}
                              onChange={(e) => {
                                if (e.target.value !== "new") return pick(r.index, e.target.value);
                                // Back to adding the person from the file.
                                const rest = { ...picked };
                                delete rest[r.index];
                                setPicked(rest);
                              }}
                            >
                              <option value="">– ข้าม / ยังไม่เลือก</option>
                              {r.match.kind === "unknownCode" && (
                                <option value="new">+ เพิ่มเป็นพนักงานใหม่</option>
                              )}
                              {options.map((row) => (
                                <option key={row.employee.id} value={row.employee.id}>
                                  {displayName(row.employee)} · {departmentName(row)}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td>
                          <ProfileCell
                            file={line.position}
                            change={r.positionChange}
                            from={r.row ? (directoryCodes.get(r.row.employee.code)?.position ?? "") : null}
                            ticked={Boolean(profileTicked[r.index])}
                            onTick={(value) => setProfileTicked({ ...profileTicked, [r.index]: value })}
                          />
                        </td>
                        <td>
                          <ProfileCell
                            file={line.team}
                            change={r.teamChange}
                            from={r.row ? (directoryCodes.get(r.row.employee.code)?.team ?? "") : null}
                            ticked={Boolean(profileTicked[r.index])}
                            onTick={(value) => setProfileTicked({ ...profileTicked, [r.index]: value })}
                          />
                        </td>
                        <td className="text-right">
                          <Change from={r.row?.salary?.baseSalary} to={r.base} />
                        </td>
                        <td className="text-right">
                          <Change from={r.row?.salary?.allowance} to={r.allowance} />
                        </td>
                        <td className="text-center">
                          <span className={`chip whitespace-nowrap ${STATUS[r.status].tone}`}>
                            {STATUS[r.status].label}
                          </span>
                        </td>
                        <td className="text-[11.5px] text-muted">{r.notes.join(" · ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {notInFile.length > 0 && (
            <details className="card overflow-hidden">
              <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-teal-900">
                มีในระบบแต่ไม่อยู่ในไฟล์ {notInFile.length} คน (ไม่มีการเปลี่ยนแปลง)
              </summary>
              <ul className="divide-y divide-line border-t border-line text-sm">
                {notInFile.map((row) => (
                  <li key={row.employee.id} className="flex justify-between gap-2 px-5 py-2">
                    <span>{displayName(row.employee)}</span>
                    <span className="text-muted">{departmentName(row)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
