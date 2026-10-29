"use client";

import { useEffect, useState } from "react";
import { MoneyInput, MultiplierInput, segment } from "@/components/CompensationParts";
import { useConfirm } from "@/components/ConfirmDialog";
import { useLeaveGuard } from "@/components/useLeaveGuard";
import { api, errorMessage } from "@/lib/api";
import {
  DEFAULT_BONUS_PLAN,
  PERFORMANCE_CAPTIONS,
  POTENTIAL_GROUPS,
  potentialGroup,
  solveBonus,
} from "@/lib/bonus";
import { bonusWorkbook } from "@/lib/bonus-export";
import { baht } from "@/lib/compensation";
import { DEPARTMENTS } from "@/lib/constants";
import { departmentRank } from "@/lib/evaluation";
import { displayName, formatScore, tenureSince } from "@/lib/format";
import { rowMultiplier } from "@/lib/merit";
import type { BonusData, BonusPlan } from "@/lib/types";

interface Notice {
  tone: "ok" | "error";
  text: string;
}

const ROUNDING = [
  { value: 0, label: "ไม่ปัด" },
  { value: 100, label: "หลักร้อย" },
  { value: 1000, label: "หลักพัน" },
  { value: 10000, label: "หลักหมื่น" },
];

const pct = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;
const months = (value: number) => `${value.toFixed(2)} เท่า`;
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

/** Scores 5 … 1, as in the Bonus sheet. */
const SCORES = [5, 4, 3, 2, 1];

export default function BonusPage() {
  const confirm = useConfirm();
  const [data, setData] = useState<BonusData | null>(null);
  const [plan, setPlan] = useState<BonusPlan>(DEFAULT_BONUS_PLAN);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [team, setTeam] = useState("all");
  const [jobLevel, setJobLevel] = useState("all");

  const load = (next: BonusData) => {
    setData(next);
    // A plan saved before the budget was typed in directly has none.
    setPlan({ ...DEFAULT_BONUS_PLAN, ...next.plan, budget: next.plan?.budget ?? null });
  };

  useEffect(() => {
    api
      .bonus()
      .then(load)
      .catch((e) => setLoadError(errorMessage(e)));
  }, []);

  useLeaveGuard(dirty);

  if (loadError) return <div className="card p-8 text-center text-red-500">{loadError}</div>;
  if (!data) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const result = solveBonus(data.overview, plan);
  const { anchor } = result;
  const noBudget = result.budget === null;

  const edit = (patch: Partial<BonusPlan>) => {
    setPlan({ ...plan, ...patch });
    setDirty(true);
    setNotice(null);
  };
  const setMultiplier = (key: "rowMultipliers" | "columnMultipliers", score: number, value: number) =>
    edit({ [key]: plan[key].map((m, i) => (i === score - 1 ? value : m)) });
  const setAdjusted = (employeeId: string, value: string) => {
    const adjustments = { ...plan.adjustments };
    if (value.trim() === "") delete adjustments[employeeId];
    else adjustments[employeeId] = Math.max(0, Number(value) || 0);
    edit({ adjustments });
  };

  const save = async () => {
    if (plan.budget === null) {
      setNotice({ tone: "error", text: "กรุณากรอกงบโบนัส" });
      return;
    }
    const agreed = await confirm({
      title: "บันทึกแผนโบนัสประจำปี?",
      message: `รอบ ${data.overview.cycleId} · งบโบนัส ${baht(result.budget ?? 0)} บาท`,
      confirmLabel: "บันทึก",
    });
    if (!agreed) return;
    setSaving(true);
    try {
      load(await api.saveBonus(plan));
      setDirty(false);
      setNotice({ tone: "ok", text: "บันทึกแล้ว" });
    } catch (e) {
      setNotice({ tone: "error", text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const discard = async () => {
    const agreed = await confirm({
      title: "ยกเลิกการแก้ไข?",
      message: data.plan ? "กลับไปใช้ค่าที่บันทึกไว้ล่าสุด" : "ล้างค่าที่กรอกไว้ทั้งหมด",
      confirmLabel: "ยกเลิกการแก้ไข",
      tone: "danger",
    });
    if (!agreed) return;
    load(data);
    setDirty(false);
    setNotice(null);
  };

  // Everyone, those not taking part greyed out with the reason.
  const lineOf = new Map(result.lines.map((line) => [line.row.employee.id, line]));
  const reasonOf = new Map(result.excluded.map(({ row, reason }) => [row.employee.id, reason]));
  const roster = data.overview.rows
    .map((row) => ({
      row,
      grade: data.overview.structure.grades.find((g) => g.grade === row.grade),
      line: lineOf.get(row.employee.id),
      reason: reasonOf.get(row.employee.id),
    }))
    .sort(
      (a, b) =>
        departmentRank(a.row.employee.departmentId) - departmentRank(b.row.employee.departmentId) ||
        (b.row.employee.level ?? 0) - (a.row.employee.level ?? 0) ||
        a.row.employee.code.localeCompare(b.row.employee.code),
    );
  type Entry = (typeof roster)[number];
  const jobLevelOf = (entry: Entry) => entry.grade?.jobLevel || entry.row.levelName || "–";
  const teamOf = (entry: Entry) => entry.row.employee.team || "ไม่ระบุทีม";
  const teams = [...new Set(roster.map(teamOf))].sort(
    (a, b) =>
      Number(!/^studio/i.test(a)) - Number(!/^studio/i.test(b)) ||
      a.localeCompare(b, "th", { numeric: true }),
  );
  const jobLevels = [...new Map(roster.map((entry) => [jobLevelOf(entry), entry.grade?.grade ?? 99]))]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label);
  const filterLabel = [jobLevel === "all" ? "" : `Job level ${jobLevel}`, team === "all" ? "" : `ทีม ${team}`]
    .filter(Boolean)
    .join(" · ");
  const shown = roster
    .filter((entry) => team === "all" || teamOf(entry) === team)
    .filter((entry) => jobLevel === "all" || jobLevelOf(entry) === jobLevel);
  const raisedOf = (entry: Entry) => (entry.line && !noBudget ? entry.line : null);
  const sum = (pick: (entry: Entry) => number | undefined | null) =>
    shown.reduce((total, entry) => total + (pick(entry) ?? 0), 0);
  const totals = {
    base: sum((e) => e.row.salary?.baseSalary),
    annual: sum((e) => (e.row.salary ? e.row.salary.baseSalary * 12 : 0)),
    suggested: sum((e) => raisedOf(e)?.suggested),
    amount: sum((e) => raisedOf(e)?.amount),
  };

  // Totals per Studio / Team, as on the right of the Bonus sheet.
  const groups = teams.map((name) => {
    const members = roster.filter((entry) => teamOf(entry) === name);
    const bonus = members.reduce((s, e) => s + (raisedOf(e)?.amount ?? 0), 0);
    const salary = members.reduce((s, e) => s + (e.row.salary?.baseSalary ?? 0), 0);
    return { name, people: members.length, bonus, salary };
  });
  const groupBonus = groups.reduce((s, g) => s + g.bonus, 0);
  const groupSalary = groups.reduce((s, g) => s + g.salary, 0);

  const countAt = (performance: number, potential: number) =>
    result.lines.filter(
      (line) =>
        Math.round(line.performanceStep) === performance && Math.round(line.potentialStep) === potential,
    ).length;
  const adjustedCount = result.lines.filter((line) => line.adjusted !== null).length;
  const overBudget = !noBudget && result.gap <= -1;
  const underBudget = !noBudget && adjustedCount > 0 && result.gap >= 1;
  const testScores = data.overview.rows.filter((row) => row.performanceIsTest).length;
  const status = noBudget
    ? { label: "ยังไม่กรอกงบโบนัส", tone: "bg-black/5 text-muted" }
    : Math.abs(result.gap) < 1
      ? { label: "ตรงงบ", tone: "bg-emerald-50 text-emerald-700" }
      : result.gap < 0
        ? { label: "เกินงบ", tone: "bg-red-50 text-red-600" }
        : { label: "ต่ำกว่างบ", tone: "bg-amber-50 text-amber-700" };

  const exportExcel = async () => {
    setExporting(true);
    try {
      // Salaries leave the system here: record it, and stop if that fails.
      await api.logBonusExport(shown.length);
      const blob = await bonusWorkbook({
        cycleId: data.overview.cycleId,
        filter: filterLabel || "พนักงานทั้งหมด",
        plan,
        budget: result.budget,
        spend: result.spend,
        gap: result.gap,
        anchor,
        groups,
        rows: shown.map((entry) => {
          const line = raisedOf(entry);
          const { row } = entry;
          return {
            code: row.employee.code,
            name: row.employee.name,
            nickname: row.employee.nickname,
            department: DEPARTMENTS.find((d) => d.id === row.employee.departmentId)?.name ?? "",
            team: teamOf(entry),
            jobTitle: row.employee.position,
            jobLevel: jobLevelOf(entry),
            performance: row.performance,
            potential: row.potential,
            group: row.potential === null ? null : potentialGroup(row.potential),
            suggestedPercent: line?.suggestedPercent ?? null,
            baseSalary: row.salary?.baseSalary ?? null,
            suggested: line?.suggested ?? null,
            adjusted: line?.adjusted ?? null,
            tenure: tenureSince(row.employee.startDate) ?? "",
            note: [
              entry.line ? (noBudget ? "ยังไม่กรอกงบโบนัส" : "") : `ไม่ได้รับโบนัสรอบนี้: ${entry.reason}`,
              row.performanceIsTest ? "คะแนนทดสอบ" : "",
              line?.adjusted !== null && line?.adjusted !== undefined ? "Adjusted กรอกเอง" : "",
            ]
              .filter(Boolean)
              .join(" · "),
          };
        }),
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `bonus-${data.overview.cycleId.replace(/[^\w-]/g, "-")}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      setNotice({ tone: "error", text: errorMessage(e) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">โบนัสประจำปี</h1>
          <p className="mt-1 text-sm text-muted">
            Bonus Matrix · Performance × Potential จากผลประเมินที่อนุมัติแล้ว รอบ {data.overview.cycleId}
            {data.updatedAt && ` · บันทึกล่าสุด ${dateTime(data.updatedAt)}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {notice && (
            <span
              role="status"
              className={`chip py-1 ${notice.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}
            >
              {notice.text}
            </span>
          )}
          {dirty && (
            <button type="button" className="btn-secondary" disabled={saving} onClick={() => void discard()}>
              ยกเลิกการแก้ไข
            </button>
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

      {testScores > 0 && (
        <p className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-5 py-2.5 text-sm text-fuchsia-800">
          ใช้คะแนนทดสอบ {testScores} คน (ป้าย &quot;ทดสอบ&quot;) แทนผลประเมินที่ยังไม่อนุมัติ ·
          ตัวเลขในหน้านี้ใช้ทดลองเท่านั้น
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        <section className="card overflow-hidden">
          <header className="border-l-4 border-rose-400 px-5 py-4">
            <h2 className="text-[17px] font-semibold tracking-tight">งบโบนัส</h2>
            <p className="text-xs text-muted">
              กรอกงบโบนัสทั้งก้อน ระบบเกลี่ยให้ตาม Bonus Matrix · โบนัสคิดจากเงินเดือนฐาน × 12
            </p>
          </header>
          {data.plan === null && (
            <p className="border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800">
              รอบนี้ยังไม่ได้บันทึกแผน: กรอกงบโบนัสแล้วกดบันทึก
            </p>
          )}
          <table className="sheet border-t border-line">
            <tbody>
              <tr>
                <td className="font-medium">
                  Total Bonus Budget
                  {!noBudget && result.payroll > 0 && (
                    <div className="text-[11px] font-normal text-faint">
                      = {pct(result.budget! / result.payroll)} ของเงินเดือนทั้งปี ·{" "}
                      {months((result.budget! / result.payroll) * 12)} โดยเฉลี่ย
                    </div>
                  )}
                </td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    <MoneyInput
                      value={plan.budget}
                      label="งบโบนัสทั้งก้อน (บาท)"
                      onChange={(value) => edit({ budget: value })}
                    />
                    <span className="w-6 text-muted">บาท</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td className={`font-medium ${overBudget ? "text-red-600" : "text-orange-600"}`}>
                  Total Bonus Spend
                </td>
                <td
                  className={`text-right font-semibold tabular-nums ${overBudget ? "text-red-600" : "text-orange-600"}`}
                >
                  {noBudget ? "–" : baht(result.spend)}
                </td>
              </tr>
              <tr>
                <td className="font-medium">Gap</td>
                <td className="text-right">
                  <span className={`chip tabular-nums ${status.tone}`}>
                    {noBudget ? status.label : `${baht(result.gap)} · ${status.label}`}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="text-muted">
                  ค่ากลาง (Performance 3 × Potential 3)
                  <div className="text-[11px] text-faint">% ของเงินเดือนทั้งปี</div>
                </td>
                <td className="text-right">
                  <span className="chip bg-lime-100 font-semibold tabular-nums text-lime-900">
                    {noBudget ? "–" : `${pct(anchor)} · ${months(anchor * 12)}`}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="text-muted">
                  เงินเดือนทั้งปีรวม
                  <div className="text-[11px] text-faint">{result.lines.length} คนที่ได้รับโบนัส</div>
                </td>
                <td className="text-right font-medium tabular-nums">{baht(result.payroll)}</td>
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
            </tbody>
          </table>
        </section>

        <section className="card overflow-hidden">
          <header className="border-l-4 border-rose-400 px-5 py-4">
            <h2 className="text-[17px] font-semibold tracking-tight">Bonus Matrix</h2>
            <p className="text-xs text-muted">
              % ของเงินเดือนทั้งปี = ค่ากลาง × ตัวคูณ Performance × ตัวคูณ Potential · ตัวเลขสีแดงแก้ได้ ·
              คะแนนทศนิยม 1 ตำแหน่งไล่ระดับระหว่างช่อง · ตัวเลขเล็กคือจำนวนเท่าของเงินเดือน
            </p>
          </header>
          <div className="overflow-x-auto border-t border-line">
            <table className="sheet min-w-[720px]">
              <thead>
                <tr>
                  <th className="w-40 text-center">Performance ↓ · Potential →</th>
                  <th className="w-20 text-center">ตัวคูณ</th>
                  {SCORES.map((score, i) => (
                    <th key={score} className="text-center">
                      <div>
                        {score} · {POTENTIAL_GROUPS[i]}
                      </div>
                      <div className="mt-1 flex justify-center">
                        <MultiplierInput
                          value={plan.columnMultipliers[score - 1]}
                          label={`ตัวคูณ Potential ${score}`}
                          onChange={(value) => setMultiplier("columnMultipliers", score, value)}
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCORES.map((performance, r) => (
                  <tr key={performance}>
                    <td className="text-center">
                      <div className="font-semibold text-teal-900">{performance}</div>
                      <div className="text-[10.5px] text-faint">{PERFORMANCE_CAPTIONS[r]}</div>
                    </td>
                    <td className="text-center">
                      <MultiplierInput
                        value={plan.rowMultipliers[performance - 1]}
                        label={`ตัวคูณ Performance ${performance}`}
                        onChange={(value) => setMultiplier("rowMultipliers", performance, value)}
                      />
                    </td>
                    {SCORES.map((potential) => {
                      const ratio =
                        anchor *
                        rowMultiplier(performance, plan.rowMultipliers) *
                        rowMultiplier(potential, plan.columnMultipliers);
                      const count = countAt(performance, potential);
                      const center = performance === 3 && potential === 3;
                      return (
                        <td
                          key={potential}
                          className={`text-center tabular-nums ${center ? "bg-lime-100" : ""} ${
                            count ? "!bg-rose-50" : ""
                          }`}
                        >
                          <div className={center ? "font-semibold" : ""}>
                            {noBudget ? "–" : pct(ratio)}
                            {count > 0 && (
                              <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 text-[10.5px] font-semibold text-white">
                                {count}
                              </span>
                            )}
                          </div>
                          {!noBudget && <div className="text-[10.5px] text-faint">{months(ratio * 12)}</div>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-2 text-xs text-muted">
            ตัวเลขในวงกลมคือจำนวนคน (นับตามคะแนนที่ปัดเป็นจำนวนเต็ม แต่ % ของแต่ละคนคิดตามทศนิยม 1 ตำแหน่ง)
          </p>
        </section>
      </div>

      <section className="card overflow-hidden">
        <header className="border-l-4 border-rose-400 px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">สรุปตาม Studio / Team</h2>
        </header>
        <div className="overflow-x-auto border-t border-line">
          <table className="sheet min-w-[640px]">
            <thead>
              <tr>
                <th>Studio / Team</th>
                <th className="text-center">คน</th>
                <th className="text-right">โบนัสรวม</th>
                <th className="text-right">% ของโบนัสทั้งหมด</th>
                <th className="text-right">เงินเดือนรวม / เดือน</th>
                <th className="text-right">% ของเงินเดือนทั้งหมด</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.name}>
                  <td className="font-medium">{group.name}</td>
                  <td className="text-center tabular-nums">{group.people}</td>
                  <td className="text-right font-semibold tabular-nums text-rose-800">{baht(group.bonus)}</td>
                  <td className="text-right tabular-nums">
                    {groupBonus ? pct(group.bonus / groupBonus) : "–"}
                  </td>
                  <td className="text-right tabular-nums">{baht(group.salary)}</td>
                  <td className="text-right tabular-nums">
                    {groupSalary ? pct(group.salary / groupSalary) : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>รวม</td>
                <td className="text-center tabular-nums">{roster.length}</td>
                <td className="text-right tabular-nums">{baht(groupBonus)}</td>
                <td className="text-right tabular-nums">{groupBonus ? "100%" : "–"}</td>
                <td className="text-right tabular-nums">{baht(groupSalary)}</td>
                <td className="text-right tabular-nums">{groupSalary ? "100%" : "–"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden">
        <header className="border-l-4 border-rose-400 px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">โบนัสรายคน</h2>
          <p className="text-xs text-muted">
            ได้รับโบนัส {result.lines.length} จาก {roster.length} คน · แถวสีเทาไม่ได้รับรอบนี้
            (ชี้เมาส์ดูเหตุผล) · ช่องสีเหลือง Adjusted กรอกยอดเองได้ (เช่น ทำงานไม่ครบปี หรือผู้บริหาร)
            ไม่กระทบคนอื่น
          </p>
          {adjustedCount > 0 && (
            <button
              type="button"
              className="btn-secondary mt-2 py-1 text-xs"
              onClick={() => edit({ adjustments: {} })}
            >
              ล้าง Adjusted ทั้งหมด ({adjustedCount} คน)
            </button>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="w-24 text-xs font-medium text-muted">Studio / Team</span>
            {["all", ...teams].map((label) => (
              <button
                key={label}
                type="button"
                aria-pressed={team === label}
                className={`${segment(team === label)} !px-3 !py-1 !text-xs`}
                onClick={() => setTeam(label)}
              >
                {label === "all" ? "ทั้งหมด" : label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="w-24 text-xs font-medium text-muted">Job level</span>
            {["all", ...jobLevels].map((label) => (
              <button
                key={label}
                type="button"
                aria-pressed={jobLevel === label}
                className={`${segment(jobLevel === label)} !px-3 !py-1 !text-xs`}
                onClick={() => setJobLevel(label)}
              >
                {label === "all" ? "ทั้งหมด" : label}
              </button>
            ))}
            <button
              type="button"
              className="btn ml-auto rounded-lg bg-emerald-700 py-1.5 text-xs text-white shadow-sm hover:bg-emerald-800"
              disabled={exporting}
              onClick={() => void exportExcel()}
            >
              {exporting ? "กำลังส่งออก…" : "Export to Excel"}
            </button>
          </div>
        </header>
        {overBudget && (
          <p
            role="alert"
            className="border-t border-red-200 bg-red-50 px-5 py-2.5 text-sm font-medium text-red-700"
          >
            โบนัสรวม {baht(result.spend)} บาท เกินงบ {baht(-result.gap)} บาท · ลดยอด Adjusted ในช่องตัวแดง
            หรือเพิ่มงบ
          </p>
        )}
        {underBudget && (
          <p
            role="status"
            className="border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800"
          >
            โบนัสรวม {baht(result.spend)} บาท ต่ำกว่างบ {baht(result.gap)} บาท
          </p>
        )}
        <div className="max-h-[75vh] overflow-auto border-t border-line">
          <table className="sheet roster min-w-[1200px]">
            <thead className="sticky top-0 z-20">
              <tr>
                <th colSpan={6} className="!border-0 !bg-white text-right !text-muted">
                  {filterLabel ? `รวม ${filterLabel}` : "รวม"}
                </th>
                <th className="sum">{baht(totals.base)}</th>
                <th className="sum">{baht(totals.annual)}</th>
                <th className="sum">{noBudget ? "–" : baht(totals.suggested)}</th>
                <th className="!border-0 !bg-white" />
                <th
                  className={`sum ${overBudget ? "!bg-red-100 !text-red-700" : "!bg-rose-200 !text-rose-900"}`}
                >
                  {noBudget ? "–" : baht(totals.amount)}
                </th>
                <th colSpan={2} className="!border-0 !bg-white" />
              </tr>
              <tr>
                <th className="sticky left-0 z-10 w-40">พนักงาน</th>
                <th className="text-center">
                  Job
                  <br />
                  level
                </th>
                <th className="text-center">
                  Performance
                  <br />
                  Score
                </th>
                <th className="text-center">
                  Potential
                  <br />
                  Score
                </th>
                <th className="text-center">
                  Group of
                  <br />
                  Potential
                </th>
                <th className="text-right">
                  Bonus
                  <br />
                  Suggestion
                </th>
                <th className="!bg-slate-100 text-right">
                  Base
                  <br />
                  Salary
                </th>
                <th className="!bg-slate-100 text-right">
                  Annual
                  <br />
                  Salary
                </th>
                <th className="text-right">
                  Bonus
                  <br />
                  Spending
                </th>
                <th className="w-28 !bg-yellow-200 text-right !text-yellow-900">Adjusted</th>
                <th className="!bg-rose-200 text-right !text-rose-900">
                  RoundUp
                  <br />
                  Bonus
                </th>
                <th className="text-right">
                  Salary
                  <br />X
                </th>
                <th>อายุงาน</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={13} className="py-6 text-center text-muted">
                    ไม่พบพนักงานตามตัวกรอง
                  </td>
                </tr>
              )}
              {shown.map((entry) => {
                const { row, line, reason } = entry;
                const { employee } = row;
                const raised = raisedOf(entry);
                const why = line ? "ยังไม่กรอกงบโบนัส" : `ไม่ได้รับโบนัสรอบนี้: ${reason}`;
                const dash = (
                  <span className="text-faint" title={why}>
                    –
                  </span>
                );
                const testBadge = row.performanceIsTest && (
                  <span className="ml-1 rounded bg-fuchsia-100 px-1 text-[10px] font-medium text-fuchsia-700">
                    ทดสอบ
                  </span>
                );
                return (
                  <tr key={employee.id} className={line ? "" : "text-muted"} title={line ? undefined : why}>
                    <td className={`sticky left-0 z-[1] ${line ? "bg-white" : "bg-slate-50"}`}>
                      <div className={`truncate ${line ? "font-medium" : ""}`}>{displayName(employee)}</div>
                      <div className="truncate text-[11px] text-faint">{teamOf(entry)}</div>
                    </td>
                    <td className="text-center font-medium" title={row.levelName ?? undefined}>
                      {jobLevelOf(entry)}
                    </td>
                    <td className="text-center tabular-nums">
                      {row.performance === null ? (
                        dash
                      ) : (
                        <>
                          <span className="font-semibold text-teal-800">{formatScore(row.performance)}</span>
                          {testBadge}
                          {line && (
                            <div className="text-[10.5px] text-faint">
                              → {line.performanceStep.toFixed(1)}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="text-center tabular-nums">
                      {row.potential === null ? (
                        dash
                      ) : (
                        <>
                          <span className="font-semibold text-rose-800">{formatScore(row.potential)}</span>
                          {line && (
                            <div className="text-[10.5px] text-faint">→ {line.potentialStep.toFixed(1)}</div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-center text-[11.5px]">
                      {row.potential === null ? dash : potentialGroup(row.potential)}
                    </td>
                    <td className="text-right tabular-nums">
                      {raised ? pct(raised.suggestedPercent) : dash}
                    </td>
                    <td className="bg-slate-50 text-right tabular-nums">
                      {row.salary ? baht(row.salary.baseSalary) : "–"}
                    </td>
                    <td className="bg-slate-50 text-right tabular-nums">
                      {row.salary ? baht(row.salary.baseSalary * 12) : "–"}
                    </td>
                    <td className="text-right tabular-nums">{raised ? baht(raised.suggested) : dash}</td>
                    <td className={raised ? "bg-yellow-50" : "text-right"}>
                      {raised ? (
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          aria-label={`Adjusted ของ ${employee.name}`}
                          className={`field min-w-[6rem] text-right font-semibold tabular-nums ${
                            raised.adjusted !== null && overBudget
                              ? "!border-red-400 !bg-red-50 !text-red-600"
                              : raised.adjusted !== null
                                ? "!border-amber-400 !bg-yellow-100"
                                : ""
                          }`}
                          placeholder={baht(raised.suggested)}
                          value={plan.adjustments[employee.id] ?? ""}
                          onChange={(e) => setAdjusted(employee.id, e.target.value)}
                        />
                      ) : (
                        dash
                      )}
                    </td>
                    <td className="text-right font-semibold tabular-nums text-rose-800">
                      {raised ? baht(raised.amount) : dash}
                    </td>
                    <td className="text-right tabular-nums">{raised ? raised.months.toFixed(2) : dash}</td>
                    <td className="whitespace-nowrap text-muted">{tenureSince(employee.startDate) ?? "–"}</td>
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
