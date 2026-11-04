"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LicenseDialog, RenewDialog } from "@/components/LicenseDialog";
import { baht, Category, Chip } from "@/components/LicenseParts";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  CATEGORIES,
  CATEGORY_DOT,
  CYCLE_NAMES,
  daysLeft,
  PAYMENT_NAMES,
  productKey,
  todayIso,
  type SoftwareLicense,
} from "@/lib/software";

/** Today's licenses as a workbook. */
async function exportLicenses(licenses: SoftwareLicense[]) {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Software License", { views: [{ state: "frozen", ySplit: 1 }] });
  const heads: [string, number][] = [
    ["โปรแกรม / บริการ", 30],
    ["รายละเอียด", 30],
    ["กลุ่ม", 22],
    ["สถานะ", 10],
    ["Seat", 7],
    ["รอบ", 10],
    ["วันเริ่ม", 12],
    ["วันหมดอายุ", 12],
    ["คงเหลือ (วัน)", 12],
    ["ราคา/หน่วย", 12],
    ["บาท/ปี", 13],
    ["วิธีจ่าย", 18],
    ["บัตร", 18],
    ["ผู้ขาย", 26],
    ["ผู้ติดต่อ", 26],
    ["หมายเหตุ", 30],
  ];
  heads.forEach(([title, width], i) => {
    sheet.getColumn(i + 1).width = width;
    const cell = sheet.getCell(1, i + 1);
    cell.value = title;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  });
  const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);
  for (const l of licenses) {
    const row = sheet.addRow([
      l.name,
      l.detail || null,
      l.category,
      l.status === "active" ? "ใช้งาน" : "ยกเลิก",
      l.seats,
      CYCLE_NAMES[l.billingCycle],
      day(l.startDate),
      day(l.expireDate),
      daysLeft(l),
      l.unitPrice,
      l.pricePerYear,
      PAYMENT_NAMES[l.paymentMethod] === "–" ? null : PAYMENT_NAMES[l.paymentMethod],
      l.cardLabel || null,
      l.vendor || null,
      l.vendorContact || null,
      l.remark || null,
    ]);
    row.getCell(7).numFmt = row.getCell(8).numFmt = "dd/mm/yyyy";
    row.getCell(10).numFmt = row.getCell(11).numFmt = "#,##0.00";
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: heads.length } };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()]));
  link.download = `software-licenses-${todayIso()}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function SoftwarePage() {
  const [licenses, setLicenses] = useState<SoftwareLicense[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SoftwareLicense | "new" | null>(null);
  const [renewing, setRenewing] = useState<SoftwareLicense | null>(null);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<"active" | "cancelled" | "all">("active");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .licenses()
      .then((r) => setLicenses(r.licenses))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <div className="card p-8 text-center text-red-500">{error}</div>;
  if (!licenses) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const words = search.trim().toLowerCase();
  const shown = licenses.filter(
    (l) =>
      (status === "all" || l.status === status) &&
      (category === "all" || l.category === category) &&
      (!words || `${l.name} ${l.detail} ${l.vendor}`.toLowerCase().includes(words)),
  );
  // Lots of the same program together, the next to expire first within each.
  const groups: SoftwareLicense[][] = [];
  for (const l of shown) {
    const group = groups.find((g) => productKey(g[0].name) === productKey(l.name));
    if (group) group.push(l);
    else groups.push([l]);
  }
  const names = [...new Set(licenses.map((l) => l.name))].sort();

  // A program's own row is a coloured band with the category's colour down its left edge;
  // the lots under it stay white and indented.
  const bar = (l: SoftwareLicense) => (
    <i className={`absolute inset-y-0 left-0 w-1.5 ${CATEGORY_DOT[l.category] ?? "bg-slate-400"}`} />
  );
  const row = (l: SoftwareLicense, inGroup: boolean, index: number) => (
    <tr
      key={l.id}
      className={`${inGroup ? "bg-white text-slate-600" : "program"} ${l.status === "cancelled" ? "text-muted" : ""}`}
    >
      <td className={inGroup ? "pl-10" : "relative pl-5"}>
        {!inGroup && bar(l)}
        <button type="button" className="text-left hover:underline" onClick={() => setEditing(l)}>
          <span className={inGroup ? "text-[12.5px]" : "font-semibold text-indigo-950"}>
            {inGroup ? `↳ ${l.detail || `ล็อตที่ ${index + 1}`}` : l.name}
          </span>
        </button>
        {!inGroup && l.detail && <div className="text-[11px] text-indigo-900/60">{l.detail}</div>}
      </td>
      <td>{inGroup ? null : <Category name={l.category} />}</td>
      <td className="text-right tabular-nums">{l.seats ?? "–"}</td>
      <td className="whitespace-nowrap">{CYCLE_NAMES[l.billingCycle]}</td>
      <td className="whitespace-nowrap tabular-nums">{formatDate(l.expireDate)}</td>
      <td>
        <Chip license={l} />
      </td>
      <td className="text-right font-medium tabular-nums">{baht(l.pricePerYear)}</td>
      <td className="text-xs">{l.vendor || <span className="text-faint">–</span>}</td>
      <td className="text-xs">
        {PAYMENT_NAMES[l.paymentMethod]}
        {l.cardLabel && <div className="text-faint">{l.cardLabel}</div>}
      </td>
      <td className="whitespace-nowrap text-right">
        {l.status === "active" && l.billingCycle !== "perpetual" && (
          <button type="button" className="btn-text !px-1.5 text-xs" onClick={() => setRenewing(l)}>
            ต่ออายุ
          </button>
        )}
        <button type="button" className="btn-text !px-1.5 text-xs" onClick={() => setEditing(l)}>
          แก้ไข
        </button>
      </td>
    </tr>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Software / License</h1>
          <p className="mt-1 text-sm text-muted">
            IT Assets · วันคงเหลือคำนวณจากวันที่จริงทุกวัน · ราคาเป็นบาทต่อปี · เห็นเฉพาะ Admin / IT
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/it-assets/software/import" className="btn-secondary py-1.5 text-sm">
            Import Excel
          </Link>
          <button
            type="button"
            className="btn-secondary py-1.5 text-sm"
            disabled={licenses.length === 0}
            onClick={() => void exportLicenses(licenses)}
          >
            Export Excel
          </button>
          <button type="button" className="btn-primary py-1.5 text-sm" onClick={() => setEditing("new")}>
            + เพิ่ม License
          </button>
        </div>
      </div>

      {licenses.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          ยังไม่มีรายการ ·{" "}
          <Link href="/it-assets/software/import" className="text-accent underline">
            Import จาก Excel
          </Link>{" "}
          หรือกด + เพิ่ม License
        </div>
      ) : (
        <>
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 bg-gradient-to-r from-indigo-50 via-sky-50 to-white px-5 py-3">
              <select
                className="field !w-auto"
                aria-label="กลุ่ม"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">ทุกกลุ่ม</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select
                className="field !w-auto"
                aria-label="สถานะ"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="active">ใช้งาน</option>
                <option value="cancelled">ยกเลิก</option>
                <option value="all">ทั้งหมด</option>
              </select>
              <input
                className="field !w-72"
                placeholder="ค้นหาชื่อโปรแกรม / รายละเอียด / ผู้ขาย…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="text-xs text-muted">{shown.length} รายการ</span>
            </div>
            <div className="overflow-x-auto border-t border-line">
              <table className="sheet min-w-[1100px]">
                <thead>
                  <tr>
                    <th>โปรแกรม / บริการ</th>
                    <th>กลุ่ม</th>
                    <th className="text-right">Seat</th>
                    <th>รอบ</th>
                    <th>หมดอายุ</th>
                    <th>คงเหลือ</th>
                    <th className="text-right">บาท/ปี</th>
                    <th>ผู้ขาย</th>
                    <th>การจ่าย</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    if (group.length === 1) return row(group[0], false, 0);
                    const head = group[0];
                    const live = group.filter((l) => l.status === "active");
                    const next = live
                      .filter((l) => daysLeft(l) !== null)
                      .sort((a, b) => (daysLeft(a) ?? 0) - (daysLeft(b) ?? 0))[0];
                    return [
                      <tr key={`group-${head.id}`} className="program">
                        <td className="relative pl-5">
                          {bar(head)}
                          <span className="font-semibold text-indigo-950">{head.name}</span>{" "}
                          <span className="chip ml-1 bg-indigo-600 text-white">{group.length} รายการ</span>
                        </td>
                        <td>
                          <Category name={head.category} />
                        </td>
                        <td className="text-right font-semibold tabular-nums">
                          {live.reduce((sum, l) => sum + (l.seats ?? 0), 0)}
                        </td>
                        <td />
                        <td className="whitespace-nowrap text-xs text-muted">
                          {next ? `เร็วสุด ${formatDate(next.expireDate)}` : ""}
                        </td>
                        <td>{next && <Chip license={next} />}</td>
                        <td className="text-right font-semibold tabular-nums">
                          {baht(live.reduce((sum, l) => sum + (l.pricePerYear ?? 0), 0))}
                        </td>
                        <td className="text-xs">{head.vendor}</td>
                        <td colSpan={2} />
                      </tr>,
                      ...group.map((l, i) => row(l, true, i)),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {editing && (
        <LicenseDialog
          editing={editing === "new" ? null : editing}
          names={names}
          onSaved={setLicenses}
          onClose={() => setEditing(null)}
        />
      )}
      {renewing && <RenewDialog license={renewing} onSaved={setLicenses} onClose={() => setRenewing(null)} />}
    </div>
  );
}
