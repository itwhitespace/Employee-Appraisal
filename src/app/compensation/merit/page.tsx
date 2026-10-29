"use client";

import { useEffect, useState } from "react";
import { CompaPill, segment, today } from "@/components/CompensationParts";
import { useConfirm } from "@/components/ConfirmDialog";
import { api, errorMessage } from "@/lib/api";
import { baht, COMPA_GROUPS, compaGroup, compaRatio, percent } from "@/lib/compensation";
import { DEPARTMENTS } from "@/lib/constants";
import { departmentRank } from "@/lib/evaluation";
import { displayName, formatScore } from "@/lib/format";
import {
  DEFAULT_MERIT_PLAN,
  percentOf,
  rowMultiplier,
  SCORE_STEPS,
  scoreStep,
  solveMerit,
  TARGET_PRESETS,
} from "@/lib/merit";
import type { MeritData, MeritPlan } from "@/lib/types";

interface Notice {
  tone: "ok" | "error";
  text: string;
}

const ROUNDING = [
  { value: 0, label: "ไม่ปัด" },
  { value: 10, label: "หลักสิบ" },
  { value: 100, label: "หลักร้อย" },
  { value: 500, label: "500 บาท" },
];

/** A raise as a percentage with one decimal, as in the Excel matrix. */
const pct = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

/** A multiplier typed as a whole percentage (150 = ×1.5). */
function MultiplierInput({
  value,
  label,
  onChange,
}: {
  value: number;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={500}
        step={5}
        aria-label={label}
        className="field w-[4.25rem] !py-0.5 text-center text-[11.5px] font-semibold tabular-nums !text-rose-700"
        value={Math.round(value * 1000) / 10}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0) / 100)}
      />
      <span className="text-[11.5px] font-semibold text-rose-700">%</span>
    </span>
  );
}

/** Whole baht, shown with thousands separators while typing; empty = null. */
function MoneyInput({
  value,
  label,
  onChange,
}: {
  value: number | null;
  label: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      placeholder="0"
      className="field w-40 text-right text-[14px] font-semibold tabular-nums"
      value={value === null ? "" : value.toLocaleString("en-US")}
      onChange={(e) => {
        const input = e.target;
        const caret = input.selectionStart ?? input.value.length;
        const digitsBefore = input.value.slice(0, caret).replace(/\D/g, "").length;
        const digits = input.value.replace(/\D/g, "").slice(0, 12);
        onChange(digits ? Number(digits) : null);
        // The commas move as digits are typed: keep the caret after the same digit.
        requestAnimationFrame(() => {
          let seen = 0;
          let at = 0;
          while (at < input.value.length && seen < digitsBefore) {
            if (/\d/.test(input.value[at])) seen++;
            at++;
          }
          input.setSelectionRange(at, at);
        });
      }}
    />
  );
}

export default function MeritPage() {
  const confirm = useConfirm();
  const [data, setData] = useState<MeritData | null>(null);
  const [plan, setPlan] = useState<MeritPlan>(DEFAULT_MERIT_PLAN);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [everyStep, setEveryStep] = useState(false);

  const load = (next: MeritData) => {
    setData(next);
    setPlan({ ...DEFAULT_MERIT_PLAN, ...next.plan });
  };

  useEffect(() => {
    api
      .merit()
      .then(load)
      .catch((e) => setLoadError(errorMessage(e)));
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (loadError) return <div className="card p-8 text-center text-red-500">{loadError}</div>;
  if (!data) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const result = solveMerit(data.overview, plan, today());
  const { anchor } = result;

  const edit = (patch: Partial<MeritPlan>) => {
    setPlan({ ...plan, ...patch });
    setDirty(true);
    setNotice(null);
  };
  const setRowMultiplier = (index: number, value: number) =>
    edit({ rowMultipliers: plan.rowMultipliers.map((m, i) => (i === index ? value : m)) });
  const setColumnMultiplier = (index: number, value: number) =>
    edit({ columnMultipliers: plan.columnMultipliers.map((m, i) => (i === index ? value : m)) });
  const setOverride = (employeeId: string, value: string) => {
    const overrides = { ...plan.overrides };
    if (value.trim() === "") delete overrides[employeeId];
    else overrides[employeeId] = Math.max(0, Number(value) || 0);
    edit({ overrides });
  };

  const save = async () => {
    if (result.budget === null) {
      setNotice({ tone: "error", text: "กรุณากรอกงบประมาณ" });
      return;
    }
    const agreed = await confirm({
      title: "บันทึกแผนขึ้นเงินเดือน?",
      message: `รอบ ${data.overview.cycleId} · งบ ${baht(result.budget)} บาทต่อเดือน`,
      confirmLabel: "บันทึก",
    });
    if (!agreed) return;
    setSaving(true);
    try {
      load(await api.saveMerit(plan));
      setDirty(false);
      setNotice({ tone: "ok", text: "บันทึกแล้ว" });
    } catch (e) {
      setNotice({ tone: "error", text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  // Five whole-score rows as in Excel, or every 0.1.
  const matrixRows = everyStep ? SCORE_STEPS : [5, 4, 3, 2, 1];
  const countAt = (step: number, group: number) =>
    result.lines.filter(
      (line) => line.group === group && (everyStep ? line.step === step : Math.round(line.step) === step),
    ).length;

  // Everyone, as in the Excel sheet; those not taking part show why.
  const lineOf = new Map(result.lines.map((line) => [line.row.employee.id, line]));
  const reasonOf = new Map(result.excluded.map(({ row, reason }) => [row.employee.id, reason]));
  const roster = data.overview.rows
    .map((row) => {
      const grade = data.overview.structure.grades.find((g) => g.grade === row.grade);
      return {
        row,
        grade,
        ratio: compaRatio(row.salary, grade),
        line: lineOf.get(row.employee.id),
        reason: reasonOf.get(row.employee.id),
      };
    })
    .sort(
      (a, b) =>
        departmentRank(a.row.employee.departmentId) - departmentRank(b.row.employee.departmentId) ||
        (b.row.employee.level ?? 0) - (a.row.employee.level ?? 0) ||
        a.row.employee.code.localeCompare(b.row.employee.code),
    );
  const overMax = result.lines.filter((line) => line.overMax).length;
  const totals = {
    suggested: result.lines.reduce((sum, line) => sum + line.suggested, 0),
    allowance: data.overview.rows.reduce((sum, row) => sum + (row.salary?.allowance ?? 0), 0),
    newSalary: result.lines.reduce((sum, line) => sum + line.newSalary, 0),
  };
  // A typed-in percentage joins the preset rows, in order.
  const typedPercent = plan.budgetAmount === null ? plan.targetPercent : null;
  const targets =
    typedPercent === null || TARGET_PRESETS.includes(typedPercent)
      ? TARGET_PRESETS
      : [...TARGET_PRESETS, typedPercent].sort((x, y) => x - y);
  const shownPercent =
    typedPercent ?? (result.budgetRatio === null ? null : Math.round(result.budgetRatio * 10000) / 100);
  const firstTime = data.plan === null;
  const noBudget = result.budget === null;
  const overBudget = !noBudget && result.gap <= -1;
  const handSet = result.lines.filter((line) => line.overridden).length;
  // Every eligible amount typed in: whatever budget is left has nobody to go to.
  const nobodyLeft = !noBudget && handSet > 0 && handSet === result.lines.length && result.gap >= 1;
  const status =
    result.budget === null
      ? { label: "ยังไม่กำหนดงบ", tone: "bg-black/5 text-muted" }
      : Math.abs(result.gap) < 1
        ? { label: "ตรงงบ", tone: "bg-emerald-50 text-emerald-700" }
        : result.gap < 0
          ? { label: "เกินงบ", tone: "bg-red-50 text-red-600" }
          : { label: "ต่ำกว่างบ", tone: "bg-amber-50 text-amber-700" };

  return (
    <div className="max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">ขึ้นเงินเดือนประจำปี</h1>
          <p className="mt-1 text-sm text-muted">
            Merit Increase Matrix · Performance Score จากผลประเมินที่อนุมัติแล้ว รอบ {data.overview.cycleId}
            {data.updatedAt && ` · บันทึกล่าสุด ${dateTime(data.updatedAt)}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {notice && (
            <span
              role="status"
              className={`chip py-1 ${
                notice.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
              }`}
            >
              {notice.text}
            </span>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <header className="border-l-4 border-teal-500 px-5 py-4">
            <h2 className="text-[17px] font-semibold tracking-tight">งบประมาณ</h2>
            <p className="text-xs text-muted">
              กรอกเป็นจำนวนเงิน หรือ % ของเงินเดือนฐานก่อนขึ้นของ {result.lines.length} คนที่มีสิทธิ์ ·
              บาทต่อเดือน
            </p>
          </header>
          {firstTime && (
            <p className="border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800">
              รอบนี้ยังไม่ได้บันทึกงบประมาณ: กรอกงบ (หรือคลิกแถวในตาราง Target) แล้วกดบันทึก · % ใน Matrix
              และยอดขึ้นรายคนจะคำนวณเมื่อมีงบ
            </p>
          )}
          <table className="sheet border-t border-line">
            <tbody>
              <tr>
                <td className="text-muted">
                  เงินเดือนฐานรวมทุกคน
                  <div className="text-[11px] text-faint">
                    เหมือน SUM(Base Salary) ใน Excel · {roster.length} คน
                  </div>
                </td>
                <td className="text-right font-medium tabular-nums">{baht(result.allPayroll)}</td>
              </tr>
              <tr>
                <td className="text-muted">
                  เงินเดือนฐานรวมคนที่มีสิทธิ์ (ใช้คำนวณ)
                  <div className="text-[11px] text-faint">
                    {result.lines.length} คนที่ผลประเมินอนุมัติแล้ว · งบถูกเกลี่ยให้คนกลุ่มนี้
                  </div>
                </td>
                <td className="text-right font-semibold tabular-nums text-teal-900">
                  {baht(result.payroll)}
                </td>
              </tr>
              <tr>
                <td className="font-medium">
                  Total Merit increase budget
                  {result.budget !== null && (
                    <div className="text-[11px] font-normal text-faint">
                      ต่อปี {baht(result.budget * 12)} บาท
                    </div>
                  )}
                </td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    <MoneyInput
                      value={result.budget}
                      label="งบประมาณขึ้นเงินเดือน (บาทต่อเดือน)"
                      onChange={(value) => edit({ budgetAmount: value, targetPercent: null })}
                    />
                    <span className="w-6 text-muted">บาท</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td className="text-muted">% ของเงินเดือนฐานรวม</td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      aria-label="% งบขึ้นเงินเดือน"
                      className="field w-24 text-right font-semibold tabular-nums"
                      value={shownPercent ?? ""}
                      onChange={(e) =>
                        edit({
                          budgetAmount: null,
                          targetPercent:
                            e.target.value === ""
                              ? null
                              : Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                        })
                      }
                    />
                    <span className="w-6 text-muted">%</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td className="font-medium text-orange-600">Total Merit increase spend</td>
                <td
                  className={`text-right font-semibold tabular-nums ${overBudget ? "text-red-600" : "text-orange-600"}`}
                >
                  {baht(result.spend)}
                </td>
              </tr>
              <tr>
                <td className="font-medium">Gap</td>
                <td className="text-right">
                  <span className={`chip tabular-nums ${status.tone}`}>
                    {result.budget === null ? status.label : `${baht(result.gap)} · ${status.label}`}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="text-muted">ค่ากลาง (90–110%, Competency 3)</td>
                <td className="text-right">
                  <span className="chip bg-lime-100 font-semibold tabular-nums text-lime-900">
                    {pct(anchor)}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="text-muted">ปัดเศษขึ้น</td>
                <td>
                  <select
                    className="field ml-auto block w-32"
                    aria-label="ปัดเศษขึ้น"
                    value={plan.roundTo}
                    onChange={(e) => edit({ roundTo: Number(e.target.value) })}
                  >
                    {ROUNDING.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr>
                <td className="text-muted">อายุงานขั้นต่ำ (เดือน)</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    aria-label="อายุงานขั้นต่ำ (เดือน)"
                    className="field ml-auto block w-24 text-right tabular-nums"
                    value={plan.minTenureMonths}
                    onChange={(e) =>
                      edit({
                        minTenureMonths: Math.min(120, Math.max(0, Math.round(Number(e.target.value) || 0))),
                      })
                    }
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="card overflow-hidden">
          <header className="border-l-4 border-teal-500 px-5 py-4">
            <h2 className="text-[17px] font-semibold tracking-tight">Target Salary Increase</h2>
            <p className="text-xs text-muted">
              คลิกแถวเพื่อใช้เป็นงบ · Amount = ROUNDUP(% × เงินเดือนฐานรวมคนที่มีสิทธิ์) ·
              คอลัมน์ขวาสุดคิดจากทุกคน แบบ Excel
            </p>
          </header>
          <table className="sheet border-t border-line">
            <thead>
              <tr>
                <th className="text-center">% increase</th>
                <th className="text-right">Amount (Baht)</th>
                <th className="text-right">Year</th>
                <th className="text-right">ทุกคน / เดือน</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => {
                const selected = typedPercent === target;
                const amount = percentOf(result.payroll, target);
                return (
                  <tr
                    key={target}
                    aria-selected={selected}
                    tabIndex={0}
                    onClick={() => edit({ targetPercent: target, budgetAmount: null })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        edit({ targetPercent: target, budgetAmount: null });
                      }
                    }}
                    className={`cursor-pointer ${selected ? "!bg-teal-600 text-white" : ""}`}
                  >
                    <td
                      className={`text-center font-semibold tabular-nums ${selected ? "" : "text-rose-600"}`}
                    >
                      {target.toFixed(1)}%
                    </td>
                    <td className="text-right tabular-nums">{baht(amount)}</td>
                    <td className="text-right tabular-nums">{baht(amount * 12)}</td>
                    <td className={`text-right tabular-nums ${selected ? "" : "text-faint"}`}>
                      {baht(percentOf(result.allPayroll, target))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-teal-500 px-5 py-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight">Merit Increase Matrix</h2>
            <p className="text-xs text-muted">
              % ขึ้น = ค่ากลาง × ตัวคูณ Competency × ตัวคูณ Compa-ratio · ตัวเลขสีแดงแก้ได้ ·
              คะแนนระหว่างจำนวนเต็มไล่ระดับทุก 0.1
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className={segment(!everyStep)} onClick={() => setEveryStep(false)}>
              5 แถว
            </button>
            <button type="button" className={segment(everyStep)} onClick={() => setEveryStep(true)}>
              ทุก 0.1 คะแนน
            </button>
          </div>
        </header>
        <div className="max-h-[560px] overflow-auto border-t border-line">
          <table className="sheet min-w-[760px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="w-28 text-center">Competency</th>
                <th className="w-24 text-center">ตัวคูณ</th>
                {COMPA_GROUPS.map((group, i) => (
                  <th key={group.label} className="text-center">
                    <div>{group.label}</div>
                    <div className="mt-1 flex justify-center">
                      <MultiplierInput
                        value={plan.columnMultipliers[i]}
                        label={`ตัวคูณ Compa-ratio ${group.label}`}
                        onChange={(value) => setColumnMultiplier(i, value)}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((step) => {
                const whole = Number.isInteger(step);
                const multiplier = rowMultiplier(step, plan.rowMultipliers);
                return (
                  <tr key={step} className={whole && everyStep ? "bg-teal-50/40" : ""}>
                    <td
                      className={`text-center tabular-nums ${whole ? "font-semibold text-teal-900" : "text-muted"}`}
                    >
                      {everyStep ? step.toFixed(1) : step}
                    </td>
                    <td className="text-center tabular-nums">
                      {whole ? (
                        <div className="flex justify-center">
                          <MultiplierInput
                            value={plan.rowMultipliers[step - 1]}
                            label={`ตัวคูณ Competency ${step}`}
                            onChange={(value) => setRowMultiplier(step - 1, value)}
                          />
                        </div>
                      ) : (
                        <span className="text-[11.5px] text-muted">
                          {Math.round(multiplier * 1000) / 10}%
                        </span>
                      )}
                    </td>
                    {COMPA_GROUPS.map((group, i) => {
                      const count = countAt(step, i);
                      const center = step === 3 && i === 2;
                      return (
                        <td
                          key={group.label}
                          className={`text-center tabular-nums ${center ? "bg-lime-100 font-semibold" : ""} ${
                            count ? "!bg-teal-100/70" : ""
                          }`}
                        >
                          {noBudget ? "–" : pct(anchor * multiplier * plan.columnMultipliers[i])}
                          {count > 0 && (
                            <span className="ml-1.5 rounded-full bg-teal-600 px-1.5 text-[10.5px] font-semibold text-white">
                              {count}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-2 text-xs text-muted">
          ตัวเลขในวงกลมคือจำนวนคนในช่องนั้น
          {!everyStep &&
            " (แบบ 5 แถว นับคนที่คะแนนปัดเป็นจำนวนเต็มแล้วตรงแถว แต่ % ของแต่ละคนคิดตามคะแนนทศนิยม 1 ตำแหน่ง)"}
        </p>
      </section>

      <section className="card overflow-hidden">
        <header className="border-l-4 border-teal-500 px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">ยอดขึ้นเงินเดือนรายคน</h2>
          <p className="text-xs text-muted">
            มีสิทธิ์ {result.lines.length} จาก {roster.length} คน · แถวสีเทาไม่ได้ขึ้นรอบนี้
            (ชี้เมาส์ดูเหตุผล) · ช่องสีเหลือง RoundUp กรอกยอดเองได้ แล้วคนที่เหลือจะแบ่งงบที่เหลือให้อัตโนมัติ
            {overMax > 0 && ` · ${overMax} คนเงินเดือนใหม่เกิน Max ของกระบอก`}
          </p>
          {handSet > 0 && (
            <button
              type="button"
              className="btn-secondary mt-2 py-1 text-xs"
              onClick={() => edit({ overrides: {} })}
            >
              ล้าง RoundUp ที่กรอกเองทั้งหมด ({handSet} คน)
            </button>
          )}
        </header>
        {overBudget && (
          <p
            role="alert"
            className="border-t border-red-200 bg-red-50 px-5 py-2.5 text-sm font-medium text-red-700"
          >
            RoundUp ที่กรอกเองรวมกันเกินงบ {baht(-result.gap)} บาท · ลดยอดในช่องตัวแดง หรือเพิ่มงบ
          </p>
        )}
        {nobodyLeft && (
          <p
            role="status"
            className="border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800"
          >
            ทุกคนถูกกรอก RoundUp เองแล้ว งบที่เหลือ {baht(result.gap)} บาทจึงไม่มีคนให้เกลี่ย ·
            ลบตัวเลขในช่องสีเหลืองเพื่อให้ระบบคำนวณให้
          </p>
        )}
        <div className="max-h-[75vh] overflow-auto border-t border-line">
          <table className="sheet roster min-w-[1100px]">
            <thead className="sticky top-0 z-20">
              <tr>
                <th colSpan={8} className="!border-0 !bg-white text-right !text-muted">
                  รวม
                </th>
                <th className="sum">{noBudget ? "–" : baht(totals.suggested)}</th>
                <th className="sum">{baht(result.allPayroll)}</th>
                <th className={`sum ${overBudget ? "!bg-red-100 !text-red-700" : "!bg-yellow-200"}`}>
                  {noBudget ? "–" : baht(result.spend)}
                </th>
                <th className="sum">{baht(totals.allowance)}</th>
                <th className="sum">{noBudget ? "–" : baht(totals.newSalary)}</th>
                <th className="!border-0 !bg-white" />
              </tr>
              <tr>
                <th className="sticky left-0 z-10 w-44">พนักงาน</th>
                <th className="text-center">
                  Job
                  <br />
                  level
                </th>
                <th className="text-center">Grade</th>
                <th className="text-center">
                  Performance
                  <br />
                  Score
                </th>
                <th className="text-center">
                  Competency
                  <br />
                  Score
                </th>
                <th className="text-center">Compa-ratio</th>
                <th className="text-center">
                  Compa-ratio
                  <br />
                  Grouping
                </th>
                <th className="text-right">
                  Merit Increase
                  <br />
                  suggestion (%)
                </th>
                <th className="text-right">
                  Merit Increase
                  <br />
                  suggestion (บาท)
                </th>
                <th className="!bg-slate-100 text-right">
                  Base
                  <br />
                  Salary
                </th>
                <th className="w-32 !bg-yellow-200 text-right !text-yellow-900">
                  RoundUp
                  <br />
                  Merit Increase
                </th>
                <th className="text-right">
                  Existing
                  <br />
                  Allowance
                </th>
                <th className="text-right">
                  เงินเดือน
                  <br />
                  ใหม่
                </th>
                <th className="text-center">
                  Compa
                  <br />
                  ใหม่
                </th>
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 && (
                <tr>
                  <td colSpan={14} className="py-6 text-center text-muted">
                    ยังไม่มีพนักงาน
                  </td>
                </tr>
              )}
              {roster.map(({ row, grade, ratio, line, reason }) => {
                const { employee } = row;
                const raised = line && !noBudget ? line : null;
                // Not raised: a dash, with the reason on hover.
                const why = line ? "รอกำหนดงบ" : `ไม่ได้ขึ้นรอบนี้: ${reason}`;
                const dash = (
                  <span className="text-faint" title={why}>
                    –
                  </span>
                );
                return (
                  <tr key={employee.id} className={line ? "" : "text-muted"} title={line ? undefined : why}>
                    <td className={`sticky left-0 z-[1] ${line ? "bg-white" : "bg-slate-50"}`}>
                      <div className={`truncate ${line ? "font-medium" : ""}`}>{displayName(employee)}</div>
                      <div className="truncate text-[11px] text-faint">
                        {DEPARTMENTS.find((d) => d.id === employee.departmentId)?.name}
                      </div>
                    </td>
                    <td className="text-center font-medium" title={row.levelName ?? undefined}>
                      {grade?.jobLevel || row.levelName || "–"}
                    </td>
                    <td className="text-center tabular-nums">
                      {grade ? <span className="font-medium text-teal-800">{grade.grade}</span> : "–"}
                    </td>
                    <td className="text-center tabular-nums">
                      {row.performance === null ? (
                        dash
                      ) : (
                        <span className="font-semibold text-teal-800">{formatScore(row.performance)}</span>
                      )}
                    </td>
                    <td className="text-center tabular-nums">
                      {row.performance === null ? dash : scoreStep(row.performance).toFixed(1)}
                    </td>
                    <td className="text-center tabular-nums">{ratio === null ? "–" : percent(ratio)}</td>
                    <td className="text-center">
                      {ratio === null ? (
                        "–"
                      ) : (
                        <span className={`chip whitespace-nowrap ${COMPA_GROUPS[compaGroup(ratio)].tone}`}>
                          {COMPA_GROUPS[compaGroup(ratio)].label}
                        </span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">
                      {raised ? pct(raised.suggestedPercent) : dash}
                    </td>
                    <td className="text-right tabular-nums">{raised ? baht(raised.suggested) : dash}</td>
                    <td className="bg-slate-50 text-right tabular-nums">
                      {row.salary ? baht(row.salary.baseSalary) : "–"}
                    </td>
                    <td className={raised ? "bg-yellow-50" : "text-right"}>
                      {raised ? (
                        <input
                          type="number"
                          min={0}
                          step={100}
                          aria-label={`RoundUp Merit Increase ของ ${employee.name}`}
                          className={`field min-w-[6.5rem] text-right font-semibold tabular-nums ${
                            raised.overridden && overBudget
                              ? "!border-red-400 !bg-red-50 !text-red-600"
                              : raised.overridden
                                ? "!border-amber-400 !bg-yellow-100"
                                : ""
                          }`}
                          placeholder={raised.overridden ? "" : baht(raised.amount)}
                          value={raised.overridden ? plan.overrides[employee.id] : ""}
                          onChange={(e) => setOverride(employee.id, e.target.value)}
                        />
                      ) : (
                        dash
                      )}
                    </td>
                    <td className="text-right tabular-nums text-muted">
                      {row.salary ? baht(row.salary.allowance) : "–"}
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {raised ? (
                        <>
                          {baht(raised.newSalary)}
                          {raised.overMax && (
                            <div className="text-[10.5px] font-medium text-amber-700">
                              เกิน Max {baht(raised.grade.max)}
                            </div>
                          )}
                        </>
                      ) : (
                        dash
                      )}
                    </td>
                    <td className="text-center">{raised ? <CompaPill ratio={raised.newRatio} /> : dash}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
