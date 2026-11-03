"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import NewEmployeeDialog from "@/components/NewEmployeeDialog";
import { useLeaveGuard } from "@/components/useLeaveGuard";
import { api, errorMessage } from "@/lib/api";
import { DEPARTMENTS, ROLE_NAMES } from "@/lib/constants";
import {
  appraisalTypeOf,
  departmentAndLevel,
  draftFrom,
  type Person,
  supervisorCodeOf,
} from "@/lib/employee-import";
import { findLevel } from "@/lib/evaluation";
import { formatDate } from "@/lib/format";
import { ImportError, type ImportLine, nameKey, readSalaryWorkbook } from "@/lib/salary-import";
import type { EmployeeChange, EmployeeImport, ImportedEmployee, JobLevel, User } from "@/lib/types";

type Status = "missing" | "new" | "update" | "same";

const STATUS: Record<Status, { label: string; tone: string; order: number }> = {
  missing: { label: "ไม่พบ / ข้อมูลไม่ครบ", tone: "bg-red-50 text-red-700", order: 0 },
  new: { label: "พนักงานใหม่", tone: "bg-sky-50 text-sky-700", order: 1 },
  update: { label: "แก้ไข", tone: "bg-emerald-50 text-emerald-700", order: 2 },
  same: { label: "ไม่เปลี่ยน", tone: "bg-black/5 text-muted", order: 3 },
};

/** One field that differs: what the system has and what the file says. */
interface Change {
  key: EmployeeChange;
  label: string;
  from: string;
  to: string;
  value: string | number | null;
}

interface Reviewed {
  index: number;
  line: ImportLine;
  user: User | null;
  status: Status;
  changes: Change[];
  /** A person to add, as filled in with the "add" button. */
  newEmployee: ImportedEmployee | null;
  /** Nobody in the system matches: the line can become a new person. */
  canAdd: boolean;
  notes: string[];
}

const departmentName = (id: string | null) => DEPARTMENTS.find((d) => d.id === id)?.name ?? "–";
const dateText = (iso: string | null) => (iso ? formatDate(iso) : "–");

/** Today's employees as a workbook with the headings this page reads; no pay in it. */
async function downloadEmployees(users: User[], levels: JobLevel[]) {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("raw data", { views: [{ state: "frozen", ySplit: 1, xSplit: 3 }] });
  const heads: [string, number][] = [
    ["No.", 6],
    ["รหัส", 8],
    ["Employee Name", 30],
    ["Nickname", 12],
    ["Role", 11],
    ["ฝ่าย", 30],
    ["Studio / Team", 18],
    ["Job Title", 34],
    ["Level", 16],
    ["หัวหน้า", 32],
    ["วันเริ่มงาน", 12],
    ["อยู่ Level นี้ตั้งแต่", 16],
    ["วันเกิด", 12],
    ["ประเภทการประเมิน", 16],
  ];
  heads.forEach(([title, width], i) => {
    sheet.getColumn(i + 1).width = width;
    const cell = sheet.getCell(1, i + 1);
    cell.value = title;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);
  [...users]
    .sort((a, b) => a.code.localeCompare(b.code))
    .forEach((u, i) => {
      const boss = u.supervisorId ? byId.get(u.supervisorId) : null;
      const row = sheet.addRow([
        i + 1,
        u.code,
        u.name,
        u.nickname || null,
        ROLE_NAMES[u.role],
        u.departmentId ? departmentName(u.departmentId) : null,
        u.team || null,
        u.position || null,
        findLevel(levels, u.departmentId, u.level)?.name ?? null,
        boss ? `${boss.name} (${boss.code})` : null,
        day(u.startDate),
        day(u.levelSince),
        day(u.birthDate),
        u.appraisalType,
      ]);
      for (const c of [11, 12, 13]) row.getCell(c).numFmt = "dd/mm/yyyy";
    });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: heads.length } };
  const buffer = await book.xlsx.writeBuffer();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([buffer]));
  link.download = `employees-${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" })}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function EmployeeImportPage() {
  const confirm = useConfirm();
  const [users, setUsers] = useState<User[] | null>(null);
  const [levels, setLevels] = useState<JobLevel[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lines, setLines] = useState<ImportLine[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  /** People to add, filled in with the "add" button, per line. */
  const [drafts, setDrafts] = useState<Record<number, ImportedEmployee>>({});
  /** The line whose new person is being filled in. */
  const [adding, setAdding] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useLeaveGuard(lines !== null && done === null);

  const load = () =>
    api
      .overview()
      .then((data) => {
        setUsers(data.users);
        setLevels(data.levels);
      })
      .catch((e) => setLoadError(errorMessage(e)));

  useEffect(() => {
    void load();
  }, []);

  if (loadError) return <div className="card p-8 text-center text-red-500">{loadError}</div>;
  if (!users) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const directory: Person[] = users;
  const byCode = new Map(users.map((u) => [u.code, u]));
  const byId = new Map(users.map((u) => [u.id, u]));

  const review = (all: ImportLine[], filled: Record<number, ImportedEmployee>): Reviewed[] => {
    const fileCodes = new Set(all.filter((l) => l.code && !byCode.has(l.code)).map((l) => l.code));
    return all.map((line, index): Reviewed => {
      const notes: string[] = [];
      const blank = { changes: [], newEmployee: null, canAdd: false };
      // The code first; without one, a name that only one person has.
      const byName = users.filter((u) => line.thaiName && nameKey(u.name) === nameKey(line.thaiName));
      const user = line.code ? (byCode.get(line.code) ?? null) : byName.length === 1 ? byName[0] : null;

      if (!user) {
        if (!line.code && byName.length > 1) {
          notes.push("ชื่อตรงกับหลายคน ใส่รหัสในไฟล์");
          return { index, line, user, status: "missing", notes, ...blank };
        }
        const draft = filled[index];
        if (!draft) {
          notes.push(
            line.code
              ? `ไม่พบรหัส ${line.code} ในระบบ · กด "เพิ่มพนักงานใหม่"`
              : `ไม่มีรหัส และไม่พบชื่อนี้ในระบบ · กด "เพิ่มพนักงานใหม่"`,
          );
          return { index, line, user, status: "missing", notes, ...blank, canAdd: true };
        }
        notes.push(
          draft.password ? "มีรหัสผ่านแล้ว" : "ยังไม่มีรหัสผ่าน: ตั้งให้ในหน้าข้อมูลพนักงานหลังนำเข้า",
        );
        return { index, line, user, status: "new", notes, ...blank, canAdd: true, newEmployee: draft };
      }

      // Someone already here: what the file says differently (blank cells change nothing).
      const changes: Change[] = [];
      const add = (
        key: EmployeeChange,
        label: string,
        from: string,
        to: string,
        value: string | number | null,
      ) => changes.push({ key, label, from: from || "(ว่าง)", to, value });
      if (line.nickname && line.nickname !== user.nickname)
        add("nickname", "ชื่อเล่น", user.nickname, line.nickname, line.nickname);
      if (line.position && line.position !== user.position)
        add("position", "ตำแหน่ง", user.position, line.position, line.position);
      if (line.team && line.team !== user.team) add("team", "ทีม", user.team, line.team, line.team);
      if (line.department || line.levelName) {
        const { department, level } = departmentAndLevel(line, levels);
        if (!department) notes.push(`ไม่พบฝ่าย ${line.department} (ข้ามช่องนี้)`);
        else if (!level) notes.push(`ไม่พบ ${line.levelName || "Level"} ในฝ่ายนี้ (ข้ามช่องนี้)`);
        else if (department.id !== user.departmentId || level.level !== user.level) {
          const before = `${departmentName(user.departmentId)} · ${findLevel(levels, user.departmentId, user.level)?.name ?? "–"}`;
          add("departmentId", "ฝ่าย / Level", before, `${department.name} · ${level.name}`, department.id);
          changes.push({ key: "level", label: "", from: "", to: "", value: level.level });
        }
      }
      const bossCode = supervisorCodeOf(line.supervisor);
      if (bossCode) {
        const current = user.supervisorId ? byId.get(user.supervisorId) : null;
        if (!byCode.has(bossCode) && !fileCodes.has(bossCode))
          notes.push(`ไม่พบหัวหน้ารหัส ${bossCode} (ข้ามช่องนี้)`);
        else if (bossCode !== current?.code && bossCode !== user.code) {
          add(
            "supervisorCode",
            "หัวหน้า",
            current ? `${current.name} (${current.code})` : "",
            line.supervisor,
            bossCode,
          );
        }
      }
      if (line.startDate && line.startDate !== user.startDate)
        add("startDate", "วันเริ่มงาน", dateText(user.startDate), dateText(line.startDate), line.startDate);
      if (line.levelSince && line.levelSince !== user.levelSince)
        add(
          "levelSince",
          "อยู่ Level นี้ตั้งแต่",
          dateText(user.levelSince),
          dateText(line.levelSince),
          line.levelSince,
        );
      if (line.birthDate && line.birthDate !== user.birthDate)
        add("birthDate", "วันเกิด", dateText(user.birthDate), dateText(line.birthDate), line.birthDate);
      if (line.appraisalType && appraisalTypeOf(line.appraisalType) !== user.appraisalType) {
        const type = appraisalTypeOf(line.appraisalType);
        add("appraisalType", "ประเภทการประเมิน", user.appraisalType, type, type);
      }
      if (line.thaiName && nameKey(line.thaiName) !== nameKey(user.name))
        notes.push("ชื่อในไฟล์ไม่ตรงกับรหัสนี้ (ไม่แก้ชื่อ)");
      return {
        index,
        line,
        user,
        status: changes.length ? "update" : "same",
        notes,
        changes,
        newEmployee: null,
        canAdd: false,
      };
    });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    setDone(null);
    setReading(true);
    try {
      const { lines: read } = await readSalaryWorkbook(file, { salary: false });
      setLines(read);
      setFileName(file.name);
      setDrafts({});
      // Changes start ticked; new people wait for a tick.
      setTicked(Object.fromEntries(review(read, {}).map((r) => [r.index, r.status === "update"])));
    } catch (e) {
      setLines(null);
      setFileError(e instanceof ImportError ? e.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setReading(false);
    }
  };

  const reviewed = lines ? review(lines, drafts) : [];
  const selectable = (r: Reviewed) => r.status === "new" || r.status === "update";
  const chosen = reviewed.filter((r) => ticked[r.index] && selectable(r));
  const counts = (Object.keys(STATUS) as Status[]).map((status) => ({
    status,
    count: reviewed.filter((r) => r.status === status).length,
  }));
  const sorted = [...reviewed].sort(
    (a, b) => STATUS[a.status].order - STATUS[b.status].order || a.line.sheetRow - b.line.sheetRow,
  );
  // New people of this import who may lead others, for the dialog.
  const newSupervisors = (except: number) =>
    Object.entries(drafts)
      .filter(([index, draft]) => Number(index) !== except && draft.role !== "employee")
      .map(([, draft]) => ({ code: draft.code, label: `${draft.name} (${draft.code}) · ใหม่` }));
  const supervisorName = (code: string) =>
    byCode.get(code)?.name ?? Object.values(drafts).find((d) => d.code === code)?.name ?? "";
  // A new supervisor left out of the import cannot lead someone who is in it.
  const newChosen = chosen.filter((r) => r.status === "new");
  const newCodesChosen = new Set(newChosen.map((r) => r.newEmployee!.code));
  const draftCodes = new Set(Object.values(drafts).map((d) => d.code));
  const bossLeftOut = newChosen.filter(
    (r) =>
      draftCodes.has(r.newEmployee!.supervisorCode) && !newCodesChosen.has(r.newEmployee!.supervisorCode),
  );
  const removeDraft = (index: number) => {
    const rest = { ...drafts };
    delete rest[index];
    setDrafts(rest);
    setTicked({ ...ticked, [index]: false });
  };

  const save = async () => {
    const changing = chosen.filter((r) => r.status === "update");
    const agreed = await confirm({
      title: "นำเข้าข้อมูลพนักงาน?",
      message: [
        newChosen.length ? `เพิ่มพนักงานใหม่ ${newChosen.length} คน` : "",
        changing.length ? `แก้ข้อมูล ${changing.length} คน` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      confirmLabel: "นำเข้า",
    });
    if (!agreed) return;
    setSaving(true);
    try {
      const payload: EmployeeImport = {
        newEmployees: newChosen.map((r) => r.newEmployee!),
        updates: changing.map((r) => ({
          employeeId: r.user!.id,
          changes: Object.fromEntries(r.changes.map((c) => [c.key, c.value])),
        })),
      };
      const result = await api.importEmployees(payload);
      setDone(`เพิ่มพนักงานใหม่ ${result.created} คน · แก้ข้อมูล ${result.updated} คน`);
      setLines(null);
      await load();
    } catch (e) {
      setFileError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/employees" className="text-sm text-accent hover:underline">
          ← ข้อมูลพนักงาน
        </Link>
        <h1 className="page-title mt-1">นำเข้าข้อมูลพนักงานจาก Excel</h1>
        <p className="mt-1 text-sm text-muted">
          เพิ่มพนักงานใหม่ (รหัสที่ยังไม่มีในระบบ) และแก้ข้อมูลคนเดิม · ไม่อ่านและไม่แก้เงินเดือน · ไม่แก้ชื่อ
          รหัส และสิทธิ์
        </p>
      </div>

      {reading && (
        <div
          role="status"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
        >
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white px-12 py-9 shadow-float">
            <span className="h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-accent" />
            <span className="text-2xl font-semibold">กำลังอ่านไฟล์…</span>
          </div>
        </div>
      )}

      <section className="card space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn cursor-pointer rounded-lg bg-emerald-700 py-1.5 text-sm text-white hover:bg-emerald-800">
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
          </label>
          <button
            type="button"
            className="btn-secondary py-1.5 text-sm"
            onClick={() => void downloadEmployees(users, levels)}
          >
            ดาวน์โหลดข้อมูลพนักงานปัจจุบัน (.xlsx)
          </button>
          {lines && (
            <span className="text-sm text-muted">
              {fileName} · {lines.length} แถว
            </span>
          )}
        </div>
        <p className="text-xs text-muted">
          ดาวน์โหลดไฟล์ปัจจุบันไปแก้ แล้วนำกลับเข้ามา · จับคู่ด้วยคอลัมน์ รหัส ·
          ช่องที่เว้นว่างในไฟล์จะไม่ถูกแก้ · รหัสที่ยังไม่มีในระบบ กด &quot;เพิ่มพนักงานใหม่&quot;
          แล้วกรอกข้อมูลที่ขาด (ฝ่าย, Level, หัวหน้า, สิทธิ์, รหัสผ่าน)
        </p>
        {fileError && (
          <p role="alert" className="text-sm text-red-600">
            {fileError}
          </p>
        )}
        {done && (
          <p role="status" className="text-sm font-medium text-emerald-700">
            นำเข้าแล้ว: {done} ·{" "}
            <Link href="/admin/employees" className="underline">
              ดูหน้าข้อมูลพนักงาน
            </Link>
          </p>
        )}
      </section>

      {lines && (
        <>
          <div className="flex flex-wrap gap-2">
            {counts.map(({ status, count }) => (
              <span key={status} className={`chip py-1 ${STATUS[status].tone}`}>
                {STATUS[status].label} {count}
              </span>
            ))}
          </div>
          <section className="card overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-accent px-5 py-4">
              <div>
                <h2 className="text-[17px] font-semibold tracking-tight">ตรวจสอบก่อนนำเข้า</h2>
                <p className="text-xs text-muted">
                  แถว &quot;แก้ไข&quot; ถูกเลือกไว้ให้แล้ว · คนที่ยังไม่มีในระบบ กด &quot;+
                  เพิ่มพนักงานใหม่&quot; กรอกข้อมูลแล้วจะถูกติ๊กให้
                </p>
              </div>
              <button
                type="button"
                className="btn-primary"
                disabled={saving || chosen.length === 0 || bossLeftOut.length > 0}
                onClick={() => void save()}
              >
                {saving ? "กำลังนำเข้า…" : `นำเข้า ${chosen.length} รายการ`}
              </button>
            </header>
            {bossLeftOut.length > 0 && (
              <p role="alert" className="border-t border-red-200 bg-red-50 px-5 py-2.5 text-sm text-red-700">
                หัวหน้าของ {bossLeftOut.map((r) => r.newEmployee!.name).join(", ")}{" "}
                เป็นพนักงานใหม่ที่ไม่ได้ติ๊กนำเข้า กรุณาติ๊กหัวหน้าด้วย หรือเปลี่ยนหัวหน้า
              </p>
            )}
            <div className="max-h-[70vh] overflow-auto border-t border-line">
              <table className="sheet min-w-[1100px]">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="w-10" aria-label="เลือก" />
                    <th className="w-14 text-center">แถว</th>
                    <th className="w-64">ในไฟล์</th>
                    <th>สิ่งที่จะเกิดขึ้น</th>
                    <th className="w-32 text-center">สถานะ</th>
                    <th className="w-72">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.index} className={r.status === "same" ? "text-muted" : ""}>
                      <td className="text-center">
                        {r.canAdd && !r.newEmployee ? (
                          <button
                            type="button"
                            className="whitespace-nowrap rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700"
                            onClick={() => setAdding(r.index)}
                          >
                            + เพิ่มพนักงานใหม่
                          </button>
                        ) : (
                          <input
                            type="checkbox"
                            aria-label={`นำเข้าแถว ${r.line.sheetRow}`}
                            disabled={!selectable(r)}
                            checked={Boolean(ticked[r.index]) && selectable(r)}
                            onChange={(e) => setTicked({ ...ticked, [r.index]: e.target.checked })}
                          />
                        )}
                      </td>
                      <td className="text-center tabular-nums text-faint">{r.line.sheetRow}</td>
                      <td>
                        <div className="font-medium">
                          {r.line.code && (
                            <span className="mr-1.5 tabular-nums text-accent">{r.line.code}</span>
                          )}
                          {r.line.thaiName || "–"}
                        </div>
                        <div className="text-[11px] text-faint">
                          {[r.line.nickname, r.line.team].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td>
                        {r.newEmployee ? (
                          <div className="space-y-0.5">
                            <div className="font-medium text-sky-700">
                              + {r.newEmployee.code} {r.newEmployee.name}
                            </div>
                            <div className="text-[11px] text-muted">
                              {departmentName(r.newEmployee.departmentId)} ·{" "}
                              {findLevel(levels, r.newEmployee.departmentId, r.newEmployee.level)?.name} ·{" "}
                              {ROLE_NAMES[r.newEmployee.role]} · หัวหน้า{" "}
                              {supervisorName(r.newEmployee.supervisorCode) || "–"}
                              {r.newEmployee.birthDate ? ` · เกิด ${dateText(r.newEmployee.birthDate)}` : ""}
                            </div>
                            <div className="text-[11px]">
                              <button
                                type="button"
                                className="btn-text !px-0"
                                onClick={() => setAdding(r.index)}
                              >
                                แก้ไข
                              </button>{" "}
                              ·{" "}
                              <button
                                type="button"
                                className="btn-text !px-0 text-red-700"
                                onClick={() => removeDraft(r.index)}
                              >
                                ไม่เพิ่ม
                              </button>
                            </div>
                          </div>
                        ) : r.changes.length ? (
                          <ul className="space-y-0.5 text-[12.5px]">
                            {r.changes
                              .filter((c) => c.label)
                              .map((c) => (
                                <li key={c.key}>
                                  <span className="text-muted">{c.label}:</span>{" "}
                                  <span className="text-faint line-through">{c.from}</span> →{" "}
                                  <span className="font-medium text-emerald-800">{c.to}</span>
                                </li>
                              ))}
                          </ul>
                        ) : r.user ? (
                          <span className="text-[12.5px]">ข้อมูลตรงกับระบบ</span>
                        ) : (
                          <span className="text-faint">–</span>
                        )}
                      </td>
                      <td className="text-center">
                        <span className={`chip whitespace-nowrap ${STATUS[r.status].tone}`}>
                          {STATUS[r.status].label}
                        </span>
                      </td>
                      <td className="text-[11.5px] text-muted">{r.notes.join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {adding !== null && (
            <NewEmployeeDialog
              initial={drafts[adding] ?? draftFrom(lines[adding], directory, levels)}
              sheetRow={lines[adding].sheetRow}
              directory={directory}
              levels={levels}
              newSupervisors={newSupervisors(adding)}
              takenCodes={
                new Set([
                  ...users.map((u) => u.code),
                  ...Object.entries(drafts)
                    .filter(([index]) => Number(index) !== adding)
                    .map(([, d]) => d.code),
                ])
              }
              onSave={(employee) => {
                setDrafts({ ...drafts, [adding]: employee });
                setTicked({ ...ticked, [adding]: true });
              }}
              onClose={() => setAdding(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
