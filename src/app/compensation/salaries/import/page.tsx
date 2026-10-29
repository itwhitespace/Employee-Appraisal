"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { today } from "@/components/CompensationParts";
import { useConfirm } from "@/components/ConfirmDialog";
import { useLeaveGuard } from "@/components/useLeaveGuard";
import { api, errorMessage } from "@/lib/api";
import { baht } from "@/lib/compensation";
import { DEPARTMENTS } from "@/lib/constants";
import { displayName } from "@/lib/format";
import { ImportError, type ImportMatch, matchLines, readSalaryWorkbook } from "@/lib/salary-import";
import type { CompensationOverview, CompensationRow } from "@/lib/types";

type Status = "missing" | "check" | "update" | "same";

const STATUS: Record<Status, { label: string; tone: string; order: number }> = {
  missing: { label: "ไม่พบ / ข้อมูลไม่ครบ", tone: "bg-red-50 text-red-700", order: 0 },
  check: { label: "ต้องตรวจ", tone: "bg-amber-50 text-amber-800", order: 1 },
  update: { label: "อัปเดต", tone: "bg-emerald-50 text-emerald-700", order: 2 },
  same: { label: "ไม่เปลี่ยน", tone: "bg-black/5 text-muted", order: 3 },
};

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
  const gradeOf = (row: CompensationRow) => data.structure.grades.find((g) => g.grade === row.grade);

  const review = (matches: ImportMatch[], choices: Record<number, string>): Reviewed[] => {
    const chosen = matches.map((match, index) =>
      choices[index] !== undefined ? (rowsById.get(choices[index]) ?? null) : match.row,
    );
    const uses = new Map<string, number>();
    for (const row of chosen) if (row) uses.set(row.employee.id, (uses.get(row.employee.id) ?? 0) + 1);

    return matches.map((match, index): Reviewed => {
      const row = chosen[index];
      const { line } = match;
      const base = line.baseSalary;
      const allowance = line.allowance ?? 0;
      const notes: string[] = [];
      if (!row) {
        notes.push(
          match.kind === "ambiguous" ? "ชื่อตรงกับหลายคน เลือกเอง" : "ไม่พบชื่อนี้ในระบบ เลือกเองหรือข้าม",
        );
        return { index, match, row, status: "missing", notes, base, allowance };
      }
      if (base === null || base <= 0) {
        notes.push("ไม่มี base salary ในไฟล์");
        return { index, match, row, status: "missing", notes, base, allowance };
      }
      if (choices[index] !== undefined) notes.push("เลือกพนักงานเอง");
      else if (match.kind === "english") notes.push("จับคู่ด้วยชื่ออังกฤษ");
      else if (match.kind === "nickname") notes.push("จับคู่ด้วยชื่อเล่น");
      if ((uses.get(row.employee.id) ?? 0) > 1) notes.push("ซ้ำกับแถวอื่นในไฟล์");
      const systemLevel = gradeOf(row)?.jobLevel ?? "";
      if (line.jobLevel && systemLevel && line.jobLevel.toLowerCase() !== systemLevel.toLowerCase()) {
        notes.push(`Job level ในไฟล์ ${line.jobLevel} · ในระบบ ${systemLevel}`);
      }
      const same = row.salary?.baseSalary === base && row.salary?.allowance === allowance;
      const unsure =
        match.kind === "nickname" ||
        (uses.get(row.employee.id) ?? 0) > 1 ||
        notes.some((n) => n.startsWith("Job"));
      const status: Status = same ? "same" : unsure ? "check" : "update";
      if (same) notes.unshift("ตรงกับข้อมูลปัจจุบัน");
      return { index, match, row, status, notes, base, allowance };
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
  const counts = (Object.keys(STATUS) as Status[]).map((status) => ({
    status,
    count: reviewed.filter((r) => r.status === status).length,
  }));
  const selectable = (r: Reviewed) => r.row !== null && r.base !== null && r.base > 0 && r.status !== "same";
  const chosen = reviewed.filter((r) => ticked[r.index] && selectable(r));
  const duplicateChosen = new Set(chosen.map((r) => r.row!.employee.id)).size !== chosen.length;
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
  };

  const save = async () => {
    if (!effectiveDate) return;
    const agreed = await confirm({
      title: `นำเข้าเงินเดือน ${chosen.length} คน?`,
      message: `บันทึกเป็นรายการเงินเดือนใหม่ มีผลวันที่ ${effectiveDate} · ประวัติเดิมยังอยู่ ถ้ามีรายการวันเดียวกันอยู่แล้วจะถูกแก้ไข`,
      confirmLabel: "นำเข้า",
    });
    if (!agreed) return;
    setSaving(true);
    try {
      const overview = await api.importSalaries(
        effectiveDate,
        note,
        chosen.map((r) => ({ employeeId: r.row!.employee.id, baseSalary: r.base!, allowance: r.allowance })),
      );
      setData(overview);
      setDone(`นำเข้าแล้ว ${chosen.length} คน มีผลวันที่ ${effectiveDate}`);
      setParsed(null);
    } catch (e) {
      setFileError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/compensation/salaries" className="text-sm text-teal-700 hover:underline">
            ← เงินเดือนพนักงาน
          </Link>
          <h1 className="page-title mt-1">นำเข้าเงินเดือนจาก Excel</h1>
          <p className="mt-1 text-sm text-muted">
            อ่านชีท raw data · จับคู่ด้วยชื่อภาษาไทย แล้วใช้ชื่ออังกฤษหรือชื่อเล่นช่วย · นำเข้าเฉพาะ base
            salary และ allowance
          </p>
        </div>
      </div>

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
          ไฟล์ถูกอ่านในเครื่องนี้เท่านั้น ไม่ได้อัปโหลดทั้งไฟล์ · อ่านเฉพาะคอลัมน์ Employee Name, Name,
          Nickname, Job level, base salary, allowance · คอลัมน์อื่น เช่น เลขบัตรประชาชน
          จะไม่ถูกอ่านหรือส่งไปที่ใด · ไฟล์ .xls ให้เปิดใน Excel แล้ว Save As เป็น .xlsx ก่อน
        </p>
        {fileError && (
          <p role="alert" className="text-sm text-red-600">
            {fileError}
          </p>
        )}
        {done && (
          <p role="status" className="text-sm font-medium text-emerald-700">
            {done} ·{" "}
            <Link href="/compensation/salaries" className="underline">
              ดูหน้าเงินเดือนพนักงาน
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
                  &quot;ต้องตรวจ&quot; ดูหมายเหตุก่อนติ๊ก
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
                  disabled={saving || chosen.length === 0 || duplicateChosen || !effectiveDate}
                  onClick={() => void save()}
                >
                  {saving ? "กำลังนำเข้า…" : `นำเข้า ${chosen.length} รายการ`}
                </button>
              </div>
            </header>
            {duplicateChosen && (
              <p role="alert" className="border-t border-red-200 bg-red-50 px-5 py-2.5 text-sm text-red-700">
                มีพนักงานคนเดียวกันถูกเลือกมากกว่าหนึ่งแถว กรุณาเลือกเพียงแถวเดียว
              </p>
            )}
            <div className="max-h-[70vh] overflow-auto border-t border-line">
              <table className="sheet min-w-[1100px]">
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
                          <div className="font-medium">{line.thaiName || "–"}</div>
                          <div className="text-[11px] text-faint">
                            {[line.englishName, line.nickname, line.jobLevel && `Job level ${line.jobLevel}`]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </td>
                        <td>
                          {r.match.row && picked[r.index] === undefined ? (
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
                              onChange={(e) => pick(r.index, e.target.value)}
                            >
                              <option value="">– ข้าม / ยังไม่เลือก</option>
                              {options.map((row) => (
                                <option key={row.employee.id} value={row.employee.id}>
                                  {displayName(row.employee)} · {departmentName(row)}
                                </option>
                              ))}
                            </select>
                          )}
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
