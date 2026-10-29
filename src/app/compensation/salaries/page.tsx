"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CompaPill, segment, Tile, today } from "@/components/CompensationParts";
import IconButton from "@/components/IconButton";
import { api, errorMessage } from "@/lib/api";
import { baht, COMPA_GROUPS, compaGroup, compaRatio, percent } from "@/lib/compensation";
import { DEPARTMENTS } from "@/lib/constants";
import { departmentRank } from "@/lib/evaluation";
import { displayName, formatDate, formatScore, tenureSince } from "@/lib/format";
import type { CompensationOverview, CompensationRow, SalaryGrade, SalaryRecord } from "@/lib/types";

interface SalaryDialogProps {
  row: CompensationRow;
  grade: SalaryGrade | undefined;
  onSave: (record: SalaryRecord) => Promise<string | null>;
  onClose: () => void;
}

/** Adds a salary record for one person, or corrects the one on the same date. */
function SalaryDialog({ row, grade, onSave, onClose }: SalaryDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [base, setBase] = useState(row.salary ? String(row.salary.baseSalary) : "");
  const [allowance, setAllowance] = useState(row.salary ? String(row.salary.allowance) : "0");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A native modal <dialog> gives focus trapping and Esc-to-close.
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const preview: SalaryRecord = {
    effectiveDate,
    baseSalary: Number(base) || 0,
    allowance: Number(allowance) || 0,
    note,
  };
  const ratio = base.trim() ? compaRatio(preview, grade) : null;
  const replaces = row.history.some((record) => record.effectiveDate === effectiveDate);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!effectiveDate) return setError("กรุณาเลือกวันที่มีผล");
    if (!(Number(base) > 0)) return setError("กรุณากรอกเงินเดือนฐาน");
    setBusy(true);
    const problem = await onSave(preview);
    setBusy(false);
    if (problem) setError(problem);
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="w-[min(560px,calc(100vw-2rem))] rounded-2xl p-0 shadow-float backdrop:bg-black/30"
    >
      <form onSubmit={submit} noValidate className="compensation">
        <header className="border-b border-line border-l-4 border-l-teal-500 px-6 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">{displayName(row.employee)}</h2>
          <p className="text-xs text-muted">
            รหัส {row.employee.code} · {row.levelName ?? "–"}
            {grade ? ` · Grade ${grade.grade} (Mid ${baht(grade.mid)})` : " · ยังไม่ได้กำหนดกระบอก"}
          </p>
        </header>

        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">วันที่มีผล</span>
            <input
              type="date"
              className="field"
              value={effectiveDate}
              onChange={(e) => {
                setEffectiveDate(e.target.value);
                setError(null);
              }}
            />
          </label>
          <div className="block">
            <span className="mb-1.5 block text-sm font-medium">Compa-ratio</span>
            <div className="pt-1.5">
              <CompaPill ratio={ratio} />
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">เงินเดือนฐาน (บาท)</span>
            <input
              type="number"
              className="field text-right tabular-nums"
              min={0}
              step={100}
              value={base}
              onChange={(e) => {
                setBase(e.target.value);
                setError(null);
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">เบี้ยเลี้ยง (บาท)</span>
            <input
              type="number"
              className="field text-right tabular-nums"
              min={0}
              step={100}
              value={allowance}
              onChange={(e) => {
                setAllowance(e.target.value);
                setError(null);
              }}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium">หมายเหตุ</span>
            <input
              className="field"
              maxLength={200}
              placeholder="เช่น ปรับประจำปี / เลื่อนตำแหน่ง"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {replaces && (
            <p className="text-xs text-amber-700 sm:col-span-2">
              มีรายการที่มีผลวันนี้อยู่แล้ว บันทึกแล้วจะแก้ไขรายการเดิม
            </p>
          )}
        </div>

        {row.history.length > 0 && (
          <div className="border-t border-line px-6 py-4">
            <h3 className="mb-2 text-xs font-semibold text-teal-800">ประวัติเงินเดือน</h3>
            <table className="sheet">
              <thead>
                <tr>
                  <th>วันที่มีผล</th>
                  <th className="text-right">เงินเดือนฐาน</th>
                  <th className="text-right">เบี้ยเลี้ยง</th>
                  <th>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {row.history.map((record) => (
                  <tr key={record.effectiveDate}>
                    <td>{formatDate(record.effectiveDate)}</td>
                    <td className="text-right tabular-nums">{baht(record.baseSalary)}</td>
                    <td className="text-right tabular-nums">{baht(record.allowance)}</td>
                    <td className="text-muted">{record.note || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          {error && (
            <p role="alert" className="mr-auto text-sm text-red-500">
              {error}
            </p>
          )}
          <button type="button" className="btn-secondary" onClick={() => dialog.current?.close()}>
            ยกเลิก
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export default function SalariesPage() {
  const [data, setData] = useState<CompensationOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [department, setDepartment] = useState<string>("all");
  const [group, setGroup] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CompensationRow | null>(null);

  useEffect(() => {
    api
      .salaries()
      .then(setData)
      .catch((e) => setLoadError(errorMessage(e)));
  }, []);

  if (loadError) return <div className="card p-8 text-center text-red-500">{loadError}</div>;
  if (!data) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const gradeOf = (row: CompensationRow) => data.structure.grades.find((g) => g.grade === row.grade);
  const rows = data.rows
    .map((row) => ({ row, grade: gradeOf(row), ratio: compaRatio(row.salary, gradeOf(row)) }))
    .sort(
      (a, b) =>
        departmentRank(a.row.employee.departmentId) - departmentRank(b.row.employee.departmentId) ||
        (b.row.employee.level ?? 0) - (a.row.employee.level ?? 0) ||
        a.row.employee.code.localeCompare(b.row.employee.code),
    );

  const inDepartment = rows.filter(
    ({ row }) => department === "all" || row.employee.departmentId === department,
  );
  const query = search.trim().toLowerCase();
  const shown = inDepartment.filter(
    ({ row, ratio }) =>
      (group === null || (ratio !== null && compaGroup(ratio) === group)) &&
      (!query ||
        `${row.employee.code} ${row.employee.name} ${row.employee.nickname}`.toLowerCase().includes(query)),
  );

  const paid = inDepartment.filter(({ row }) => row.salary);
  const ratios = inDepartment.flatMap(({ ratio }) => (ratio === null ? [] : [ratio]));
  const payroll = paid.reduce((sum, { row }) => sum + row.salary!.baseSalary + row.salary!.allowance, 0);
  const groupCounts = COMPA_GROUPS.map((_, i) => ratios.filter((r) => compaGroup(r) === i).length);

  // Opening one person's pay is recorded by name in the access log.
  const openPerson = (row: CompensationRow) => {
    setEditing(row);
    void api.logSalaryView(row.employee.id).catch(() => undefined);
  };

  const save = async (record: SalaryRecord): Promise<string | null> => {
    if (!editing) return null;
    try {
      setData(await api.saveSalary(editing.employee.id, record));
      setEditing(null);
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  };

  return (
    <div className="max-w-[1180px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">ฐานเงินเดือนพนักงาน</h1>
          <p className="mt-1 text-sm text-muted">
            Compa-ratio = เงินเดือนฐาน ÷ Mid ของกระบอก · Performance จากผลประเมินที่อนุมัติแล้ว รอบ{" "}
            {data.cycleId}
          </p>
        </div>
        <Link
          href="/compensation/salaries/import"
          className="btn rounded-lg bg-emerald-700 py-1.5 text-sm text-white shadow-sm hover:bg-emerald-800"
        >
          Import Excel
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="พนักงานที่มีข้อมูลเงินเดือน" value={`${paid.length} / ${inDepartment.length}`} />
        <Tile label="เงินเดือนรวมต่อเดือน" value={baht(payroll)} note="เงินเดือนฐาน + เบี้ยเลี้ยง" />
        <Tile
          label="Compa-ratio เฉลี่ย"
          value={ratios.length ? percent(ratios.reduce((s, r) => s + r, 0) / ratios.length) : "–"}
        />
        <Tile
          label="Compa-ratio ต่ำกว่า 80%"
          value={String(groupCounts[0])}
          note={`เกิน 120%: ${groupCounts[COMPA_GROUPS.length - 1]} คน`}
        />
      </div>

      <section className="card space-y-3 px-5 py-4">
        <div>
          <div className="mb-2 text-xs font-medium text-muted">ฝ่าย</div>
          <div className="flex flex-wrap gap-2">
            {[{ id: "all", name: "ทั้งหมด" }, ...DEPARTMENTS].map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={department === d.id}
                onClick={() => setDepartment(d.id)}
                className={segment(department === d.id)}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-medium text-muted">กลุ่ม Compa-ratio</div>
            <div className="flex flex-wrap gap-2">
              {COMPA_GROUPS.map((g, i) => (
                <button
                  key={g.label}
                  type="button"
                  aria-pressed={group === i}
                  onClick={() => setGroup(group === i ? null : i)}
                  className={`chip gap-1.5 py-1.5 text-sm transition ${g.tone} ${
                    group === i ? "ring-2 ring-teal-600 ring-offset-1" : "opacity-90 hover:opacity-100"
                  }`}
                >
                  {g.label}
                  <span className="font-semibold tabular-nums">{groupCounts[i]}</span>
                </button>
              ))}
            </div>
          </div>
          <input
            className="field w-64"
            placeholder="ค้นหารหัส / ชื่อ / ชื่อเล่น"
            aria-label="ค้นหาพนักงาน"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="sheet min-w-[900px]">
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th>ฝ่าย / Level</th>
                <th>Grade · Mid</th>
                <th>อายุงาน</th>
                <th className="text-right">เงินเดือนฐาน</th>
                <th className="text-right">เบี้ยเลี้ยง</th>
                <th className="text-center">Compa-ratio</th>
                <th className="text-center">Performance</th>
                <th className="w-14" aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted">
                    ไม่พบพนักงานตามเงื่อนไขที่เลือก
                  </td>
                </tr>
              )}
              {shown.map(({ row, grade, ratio }) => (
                <tr key={row.employee.id}>
                  <td>
                    <div className="font-medium">{displayName(row.employee)}</div>
                    <div className="text-[11px] tabular-nums text-faint">{row.employee.code}</div>
                  </td>
                  <td>
                    <div>{DEPARTMENTS.find((d) => d.id === row.employee.departmentId)?.name}</div>
                    <div className="text-[11px] text-faint">{row.levelName ?? "–"}</div>
                  </td>
                  <td className="whitespace-nowrap tabular-nums">
                    {grade ? (
                      <>
                        <span className="font-medium text-teal-800">G{grade.grade}</span>
                        <span className="text-faint"> · {baht(grade.mid)}</span>
                      </>
                    ) : (
                      <span className="text-[11px] text-amber-700">ยังไม่กำหนดกระบอก</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    {tenureSince(row.employee.startDate) ?? "–"}
                  </td>
                  <td className="text-right font-medium tabular-nums">
                    {row.salary ? baht(row.salary.baseSalary) : <span className="text-faint">–</span>}
                  </td>
                  <td className="text-right tabular-nums text-muted">
                    {row.salary ? baht(row.salary.allowance) : "–"}
                  </td>
                  <td className="text-center">
                    <CompaPill ratio={ratio} />
                  </td>
                  <td className="text-center tabular-nums">
                    {row.performance === null ? (
                      <span className="text-[11px] text-faint">ยังไม่อนุมัติ</span>
                    ) : (
                      <>
                        <span className="font-semibold text-teal-800">{formatScore(row.performance)}</span>
                        {row.performanceIsTest && (
                          <span className="ml-1 rounded bg-fuchsia-100 px-1 text-[10px] font-medium text-fuchsia-700">
                            ทดสอบ
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="!px-1 !py-0.5 text-right">
                    <IconButton icon="edit" label="แก้ไขเงินเดือน" onClick={() => openPerson(row)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <SalaryDialog
          key={editing.employee.id}
          row={editing}
          grade={gradeOf(editing)}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
