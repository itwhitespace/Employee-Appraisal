"use client";

import { useEffect, useState } from "react";
import { RenewDialog } from "@/components/LicenseDialog";
import { baht, LicenseSummary } from "@/components/LicenseParts";
import { useLeaveGuard } from "@/components/useLeaveGuard";
import { api, errorMessage } from "@/lib/api";
import {
  BUDGET_GROUPS,
  budgetMonthsOf,
  fiscalMonths,
  fiscalYearOf,
  productKey,
  todayIso,
  type BudgetGroup,
  type HardwareLine,
  type SoftwareLicense,
} from "@/lib/software";

/** "2026-10" → "Oct 26", as in the IT Budget workbook. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const addUp = (rows: number[][]) => Array.from({ length: 12 }, (_, i) => sum(rows.map((r) => r[i] ?? 0)));
const dmy = (iso: string) => iso.split("-").reverse().join("/");

interface BudgetRow {
  key: string;
  item: string;
  detail: string;
  months: number[];
  endDates: string;
}

/** One row per program, as in the workbook: its lots added up, each lot's expiry listed. */
function softwareRows(licenses: SoftwareLicense[], group: BudgetGroup, year: number): BudgetRow[] {
  const mine = licenses.filter((l) => l.status === "active" && l.budgetGroup === group);
  const rows: BudgetRow[] = [];
  for (const key of [...new Set(mine.map((l) => productKey(l.name)))]) {
    const lots = mine.filter((l) => productKey(l.name) === key);
    const seats = sum(lots.map((l) => l.seats ?? 0));
    rows.push({
      key,
      item: lots[0].name,
      detail:
        lots.length === 1
          ? lots[0].detail || (seats ? `${seats} seat` : "")
          : `${seats} seat · ${lots.length} รายการ`,
      months: addUp(lots.map((l) => budgetMonthsOf(l, year))),
      endDates: lots
        .filter((l) => l.expireDate)
        .map((l) => `${dmy(l.expireDate!)}${lots.length > 1 && l.seats ? ` (${l.seats})` : ""}`)
        .join(", "),
    });
  }
  return rows.sort((a, b) => a.item.localeCompare(b.item));
}

const Money = ({ value, strong }: { value: number; strong?: boolean }) => (
  <td className={`text-right tabular-nums ${strong ? "font-semibold" : ""} ${value ? "" : "text-faint"}`}>
    {value ? baht(value) : "–"}
  </td>
);

export default function ItDashboardPage() {
  const [licenses, setLicenses] = useState<SoftwareLicense[] | null>(null);
  const [year, setYear] = useState(() => fiscalYearOf(todayIso()));
  const [hardware, setHardware] = useState<Omit<HardwareLine, "id">[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renewing, setRenewing] = useState<SoftwareLicense | null>(null);

  useLeaveGuard(dirty);

  useEffect(() => {
    api
      .licenses()
      .then((r) => setLicenses(r.licenses))
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    setHardware(null);
    setDirty(false);
    api
      .hardwareBudget(year)
      .then((r) => setHardware(r.hardware))
      .catch((e) => setError(errorMessage(e)));
  }, [year]);

  if (error) return <div className="card p-8 text-center text-red-500">{error}</div>;
  if (!licenses || !hardware) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const months = fiscalMonths(year);
  const backOffice = softwareRows(licenses, "back-office", year);
  const designer = softwareRows(licenses, "designer", year);
  const backTotal = addUp(backOffice.map((r) => r.months));
  const designTotal = addUp(designer.map((r) => r.months));
  const softwareTotal = addUp([backTotal, designTotal]);
  const hardwareRows = hardware.map((h) => months.map((m) => h.amounts[m] ?? 0));
  const hardwareTotal = addUp(hardwareRows);
  const grandTotal = addUp([softwareTotal, hardwareTotal]);

  const editHardware = (index: number, patch: Partial<Omit<HardwareLine, "id">>) => {
    setHardware(hardware.map((h, i) => (i === index ? { ...h, ...patch } : h)));
    setDirty(true);
    setNotice(null);
  };
  const saveHardware = async () => {
    const lines = hardware.filter((h) => h.item.trim());
    setSaving(true);
    try {
      setHardware((await api.saveHardwareBudget(year, lines)).hardware);
      setDirty(false);
      setNotice("บันทึก Hardware แล้ว");
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const groupRows = (title: string, rows: BudgetRow[], total: number[]) => [
    <tr key={`${title}-head`} className="bg-indigo-200">
      <td colSpan={16} className="border-l-4 border-l-indigo-600 font-bold text-indigo-950">
        {title}
      </td>
    </tr>,
    ...rows.map((r) => (
      <tr key={r.key}>
        <td className="font-medium">{r.item}</td>
        <td className="break-words text-[11px] text-muted">{r.detail}</td>
        {r.months.map((v, i) => (
          <Money key={i} value={v} />
        ))}
        <Money value={sum(r.months)} strong />
        <td className="break-words text-[10.5px] leading-snug text-muted">{r.endDates}</td>
      </tr>
    )),
    <tr key={`${title}-total`} className="bg-slate-50">
      <td colSpan={2} className="text-right font-semibold">
        TOTAL {title}
      </td>
      {total.map((v, i) => (
        <Money key={i} value={v} strong />
      ))}
      <Money value={sum(total)} strong />
      <td />
    </tr>,
  ];

  const years = [year - 1, year, year + 1];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">IT Assets Dashboard</h1>
          <p className="mt-1 text-sm text-muted">ภาพรวม License และงบประมาณ IT · ราคาเป็นบาท ไม่รวม VAT</p>
        </div>
      </div>

      <LicenseSummary licenses={licenses} onRenew={setRenewing} />

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-indigo-500 px-5 py-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight">
              IT Budget {monthLabel(months[0])} – {monthLabel(months[11])}
            </h2>
            <p className="text-xs text-muted">
              Software คิดจากรายการ License ในระบบ: ยอดต่อปีลงในเดือนที่จ่าย (เดือนเริ่มรอบ ถ้าเริ่มในปีงบนี้
              ไม่งั้นเดือนที่ต่ออายุ) · รายเดือนกระจายทุกเดือน · Hardware กรอกเองด้านล่าง
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="field !w-auto"
              aria-label="ปีงบประมาณ"
              value={year}
              disabled={dirty}
              title={dirty ? "บันทึก Hardware ก่อนเปลี่ยนปี" : undefined}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  ปีงบ Oct {y} – Sep {y + 1}
                </option>
              ))}
            </select>
          </div>
        </header>
        <div className="overflow-x-auto border-t border-line">
          {/* Fixed widths so the whole year fits the screen without scrolling. */}
          <table className="sheet budget min-w-[1080px] table-fixed text-[11.5px]">
            <colgroup>
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              {months.map((m) => (
                <col key={m} className="w-[5%]" />
              ))}
              <col className="w-[7%]" />
              <col className="w-[11%]" />
            </colgroup>
            <thead>
              <tr>
                <th>Item</th>
                <th>Detail</th>
                {months.map((m) => (
                  <th key={m} className="text-right">
                    {monthLabel(m)}
                  </th>
                ))}
                <th className="text-right">Price/Year</th>
                <th className="w-56">End date</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-indigo-600 text-white">
                <td colSpan={16} className="font-semibold tracking-wide">
                  SOFTWARE
                </td>
              </tr>
              {groupRows(BUDGET_GROUPS["back-office"], backOffice, backTotal)}
              {groupRows(BUDGET_GROUPS.designer, designer, designTotal)}
              <tr className="bg-indigo-100">
                <td colSpan={2} className="text-right font-bold">
                  TOTAL SOFTWARE
                </td>
                {softwareTotal.map((v, i) => (
                  <Money key={i} value={v} strong />
                ))}
                <Money value={sum(softwareTotal)} strong />
                <td />
              </tr>

              <tr className="bg-teal-600 text-white">
                <td colSpan={16} className="font-semibold tracking-wide">
                  HARDWARE
                </td>
              </tr>
              {hardware.map((h, index) => (
                <tr key={index}>
                  <td>
                    <input
                      className="field !px-1.5 !py-1 text-[11.5px]"
                      placeholder="รายการ เช่น Notebook"
                      aria-label={`รายการ Hardware แถว ${index + 1}`}
                      value={h.item}
                      onChange={(e) => editHardware(index, { item: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="field !px-1.5 !py-1 text-[11.5px]"
                      placeholder="รายละเอียด"
                      aria-label={`รายละเอียด Hardware แถว ${index + 1}`}
                      value={h.detail}
                      onChange={(e) => editHardware(index, { detail: e.target.value })}
                    />
                  </td>
                  {months.map((m) => (
                    <td key={m}>
                      <input
                        className="field !px-1 !py-1 text-right text-[11.5px] tabular-nums"
                        inputMode="decimal"
                        aria-label={`${h.item || "Hardware"} ${monthLabel(m)}`}
                        value={h.amounts[m] ?? ""}
                        onChange={(e) => {
                          const text = e.target.value.replace(/,/g, "");
                          const amounts = { ...h.amounts };
                          if (text === "" || Number.isNaN(Number(text))) delete amounts[m];
                          else amounts[m] = Number(text);
                          editHardware(index, { amounts });
                        }}
                      />
                    </td>
                  ))}
                  <Money value={sum(hardwareRows[index])} strong />
                  <td>
                    <button
                      type="button"
                      className="btn-text !px-1 text-xs text-red-600"
                      onClick={() => {
                        setHardware(hardware.filter((_, i) => i !== index));
                        setDirty(true);
                      }}
                    >
                      ลบแถว
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={16}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-secondary py-1 text-xs"
                      onClick={() => {
                        setHardware([...hardware, { item: "", detail: "", amounts: {} }]);
                        setDirty(true);
                      }}
                    >
                      + เพิ่มแถว Hardware
                    </button>
                    <button
                      type="button"
                      className="btn-primary py-1 text-xs"
                      disabled={!dirty || saving}
                      onClick={() => void saveHardware()}
                    >
                      {saving ? "กำลังบันทึก…" : "บันทึก Hardware"}
                    </button>
                    {dirty && <span className="text-xs text-amber-700">ยังไม่ได้บันทึก</span>}
                    {notice && <span className="text-xs text-muted">{notice}</span>}
                  </div>
                </td>
              </tr>
              <tr className="bg-teal-50">
                <td colSpan={2} className="text-right font-bold">
                  TOTAL HARDWARE
                </td>
                {hardwareTotal.map((v, i) => (
                  <Money key={i} value={v} strong />
                ))}
                <Money value={sum(hardwareTotal)} strong />
                <td />
              </tr>
              <tr className="bg-slate-900 text-white">
                <td colSpan={2} className="text-right font-bold">
                  GRAND TOTAL
                </td>
                {grandTotal.map((v, i) => (
                  <td key={i} className="text-right font-semibold tabular-nums">
                    {v ? baht(v) : "–"}
                  </td>
                ))}
                <td className="text-right font-bold tabular-nums">{baht(sum(grandTotal))}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {renewing && <RenewDialog license={renewing} onSaved={setLicenses} onClose={() => setRenewing(null)} />}
    </div>
  );
}
