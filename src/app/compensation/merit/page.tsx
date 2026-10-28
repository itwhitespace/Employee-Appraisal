"use client";

import { useEffect, useState } from "react";
import { CompaPill, segment, Tile, today } from "@/components/CompensationParts";
import { useConfirm } from "@/components/ConfirmDialog";
import { api, errorMessage } from "@/lib/api";
import { baht, COMPA_GROUPS } from "@/lib/compensation";
import { DEPARTMENTS } from "@/lib/constants";
import { departmentRank } from "@/lib/evaluation";
import { displayName, formatScore } from "@/lib/format";
import {
  DEFAULT_MERIT_PLAN,
  rowMultiplier,
  SCORE_STEPS,
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
    <input
      type="number"
      min={0}
      max={500}
      step={5}
      aria-label={label}
      className="field w-[4.5rem] !py-0.5 text-center text-[11.5px] font-semibold tabular-nums !text-rose-700"
      value={Math.round(value * 1000) / 10}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0) / 100)}
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
    const agreed = await confirm({
      title: "บันทึกแผนขึ้นเงินเดือน?",
      message: `รอบ ${data.overview.cycleId} · งบ ${plan.targetPercent}% ของเงินเดือนฐาน`,
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

  const lines = [...result.lines].sort(
    (a, b) =>
      departmentRank(a.row.employee.departmentId) - departmentRank(b.row.employee.departmentId) ||
      (b.row.employee.level ?? 0) - (a.row.employee.level ?? 0) ||
      a.row.employee.code.localeCompare(b.row.employee.code),
  );
  const overMax = result.lines.filter((line) => line.overMax).length;
  const customPreset = !TARGET_PRESETS.includes(plan.targetPercent);

  return (
    <div className="max-w-[1180px] space-y-5">
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
          <button type="button" className="btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>

      <section className="card space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <div className="mb-2 text-xs font-medium text-muted">งบขึ้นเงินเดือน (% ของเงินเดือนฐานรวม)</div>
            <div className="flex flex-wrap items-center gap-2">
              {TARGET_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={plan.targetPercent === preset}
                  className={segment(plan.targetPercent === preset)}
                  onClick={() => edit({ targetPercent: preset })}
                >
                  {preset.toFixed(1)}%
                </button>
              ))}
              <label className="flex items-center gap-1.5 text-sm text-muted">
                อื่นๆ
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  aria-label="% งบประมาณที่กำหนดเอง"
                  className={`field w-20 text-right tabular-nums ${customPreset ? "!border-teal-500" : ""}`}
                  value={plan.targetPercent}
                  onChange={(e) => edit({ targetPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                />
                %
              </label>
            </div>
          </div>
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-muted">ปัดเศษขึ้น</span>
            <select
              className="field w-32"
              value={plan.roundTo}
              onChange={(e) => edit({ roundTo: Number(e.target.value) })}
            >
              {ROUNDING.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-muted">อายุงานขั้นต่ำ (เดือน)</span>
            <input
              type="number"
              min={0}
              max={120}
              className="field w-24 text-right tabular-nums"
              value={plan.minTenureMonths}
              onChange={(e) =>
                edit({ minTenureMonths: Math.min(120, Math.max(0, Math.round(Number(e.target.value) || 0))) })
              }
            />
          </label>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile
          label="เงินเดือนฐานรวม (ก่อนขึ้น)"
          value={baht(result.payroll)}
          note={`${result.lines.length} คนที่มีสิทธิ์`}
        />
        <Tile
          label={`งบต่อเดือน (${plan.targetPercent}%)`}
          value={baht(result.budget)}
          note={`ต่อปี ${baht(result.budget * 12)}`}
        />
        <Tile label="ยอดขึ้นจริงต่อเดือน" value={baht(result.spend)} note={`ต่อปี ${baht(result.spend * 12)}`} />
        <Tile
          label="ส่วนต่าง (Gap)"
          value={baht(result.gap)}
          note={result.gap < 0 ? "เกินงบ: ยอดที่กำหนดเองรวมเกินงบ" : "งบ − ยอดขึ้นจริง"}
        />
        <Tile label="ค่ากลาง (90–110%, Competency 3)" value={pct(anchor)} note="คำนวณจากงบอัตโนมัติ" />
      </div>

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-teal-500 px-5 py-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight">Merit Increase Matrix</h2>
            <p className="text-xs text-muted">
              % ขึ้น = ค่ากลาง × ตัวคูณ Competency × ตัวคูณ Compa-ratio · ตัวเลขสีแดงแก้ได้ · คะแนนระหว่างจำนวนเต็มไล่ระดับทุก 0.1
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
                    <td className={`text-center tabular-nums ${whole ? "font-semibold text-teal-900" : "text-muted"}`}>
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
                        <span className="text-[11.5px] text-muted">{Math.round(multiplier * 1000) / 10}%</span>
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
                          {pct(anchor * multiplier * plan.columnMultipliers[i])}
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
          {!everyStep && " (แบบ 5 แถว นับคนที่คะแนนปัดเป็นจำนวนเต็มแล้วตรงแถว แต่ % ของแต่ละคนคิดตามคะแนนทศนิยม 1 ตำแหน่ง)"}
        </p>
      </section>

      <section className="card overflow-hidden">
        <header className="border-l-4 border-teal-500 px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">ยอดขึ้นเงินเดือนรายคน</h2>
          <p className="text-xs text-muted">
            กรอกจำนวนเงินเองได้ (เช่น ปัดขึ้น) แล้วคนที่เหลือจะแบ่งงบที่เหลือให้อัตโนมัติ · ลบตัวเลขออกเพื่อกลับไปใช้ค่าที่ระบบแนะนำ
            {overMax > 0 && ` · ${overMax} คนเงินเดือนใหม่เกิน Max ของกระบอก`}
          </p>
        </header>
        <div className="overflow-x-auto border-t border-line">
          <table className="sheet min-w-[1000px]">
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th>Grade</th>
                <th className="text-right">เงินเดือนฐาน</th>
                <th className="text-center">Compa-ratio</th>
                <th className="text-center">Performance</th>
                <th className="text-right">% ขึ้น</th>
                <th className="w-32 text-right">ขึ้น (บาท)</th>
                <th className="text-right">เงินเดือนใหม่</th>
                <th className="text-center">Compa ใหม่</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted">
                    ยังไม่มีพนักงานที่มีสิทธิ์ขึ้นเงินเดือน
                  </td>
                </tr>
              )}
              {lines.map((line) => {
                const { employee } = line.row;
                const suggested = line.overridden ? undefined : line.amount;
                return (
                  <tr key={employee.id}>
                    <td>
                      <div className="font-medium">{displayName(employee)}</div>
                      <div className="text-[11px] text-faint">
                        {employee.code} · {DEPARTMENTS.find((d) => d.id === employee.departmentId)?.name}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="font-medium text-teal-800">G{line.grade.grade}</span>
                      <span className="text-faint"> · {line.row.levelName}</span>
                    </td>
                    <td className="text-right tabular-nums">{baht(line.baseSalary)}</td>
                    <td className="text-center">
                      <CompaPill ratio={line.ratio} />
                    </td>
                    <td className="text-center tabular-nums">
                      <span className="font-semibold text-teal-800">{formatScore(line.row.performance)}</span>
                      <span className="text-[11px] text-faint"> → {line.step.toFixed(1)}</span>
                    </td>
                    <td className="text-right font-semibold tabular-nums text-teal-800">{pct(line.percent)}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        aria-label={`จำนวนเงินขึ้นของ ${employee.name}`}
                        className={`field text-right tabular-nums ${line.overridden ? "!border-amber-400 !bg-amber-50" : ""}`}
                        placeholder={suggested === undefined ? "" : baht(suggested)}
                        value={line.overridden ? plan.overrides[employee.id] : ""}
                        onChange={(e) => setOverride(employee.id, e.target.value)}
                      />
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {baht(line.newSalary)}
                      {line.overMax && (
                        <div className="text-[10.5px] font-medium text-amber-700">เกิน Max {baht(line.grade.max)}</div>
                      )}
                    </td>
                    <td className="text-center">
                      <CompaPill ratio={line.newRatio} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {result.excluded.length > 0 && (
        <details className="card overflow-hidden">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-teal-900">
            ไม่ได้อยู่ในรอบนี้ {result.excluded.length} คน
          </summary>
          <ul className="divide-y divide-line border-t border-line text-sm">
            {result.excluded.map(({ row, reason }) => (
              <li key={row.employee.id} className="flex flex-wrap justify-between gap-2 px-5 py-2">
                <span>
                  {displayName(row.employee)} <span className="text-faint">· {row.employee.code}</span>
                </span>
                <span className="text-muted">{reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
