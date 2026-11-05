"use client";

import { BriefcaseBusiness, Globe, Package, Palette, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LicenseDialog, RenewDialog } from "@/components/LicenseDialog";
import { baht, Category, Chip } from "@/components/LicenseParts";
import { BouncyAccordion } from "@/components/ui/be-ui-bouncy-accordion";
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

/** A lucide icon per category, on a tile in the category's colour. */
const CATEGORY_ICON: Record<string, LucideIcon> = {
  โปรแกรมออกแบบ: Palette,
  งานสำนักงาน: BriefcaseBusiness,
  "ความปลอดภัย / เครือข่าย": ShieldCheck,
  "เว็บไซต์ / การตลาด": Globe,
};

/** Name, category, seats, the next expiry, its standing and baht a year: the closed row and the heading. */
const COLUMNS = "grid grid-cols-[minmax(0,1fr)_170px_56px_130px_110px_96px] items-center gap-3";

export default function SoftwarePage() {
  const [licenses, setLicenses] = useState<SoftwareLicense[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SoftwareLicense | "new" | null>(null);
  const [renewing, setRenewing] = useState<SoftwareLicense | null>(null);
  const [category, setCategory] = useState("all");
  const [program, setProgram] = useState("all");
  const [search, setSearch] = useState("");
  // The program that is open; one at a time.
  const [openKey, setOpenKey] = useState<string | null>(null);

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
      (program === "all" || productKey(l.name) === program) &&
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
  const programs = [...new Map(licenses.map((l) => [productKey(l.name), l.name])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );

  const items = groups.map((group) => {
    const head = group[0];
    const live = group.filter((l) => l.status === "active");
    const next = live
      .filter((l) => daysLeft(l) !== null)
      .sort((a, b) => (daysLeft(a) ?? 0) - (daysLeft(b) ?? 0))[0];
    const Icon = CATEGORY_ICON[head.category] ?? Package;
    return {
      id: productKey(head.name),
      icon: (
        <span
          className={`grid h-8 w-8 place-items-center rounded-xl text-white shadow-sm ${
            CATEGORY_DOT[head.category] ?? "bg-slate-400"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
      ),
      title: (
        <span className={COLUMNS}>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate font-semibold text-slate-800">{head.name}</span>
              {group.length > 1 && (
                <span className="chip shrink-0 bg-indigo-100 text-indigo-700">{group.length} รายการ</span>
              )}
              {live.length === 0 && <span className="chip shrink-0 bg-slate-100 text-slate-500">ยกเลิก</span>}
            </span>
            <span className="block truncate text-xs font-normal text-muted">
              {group.length === 1 ? head.detail || head.vendor : head.vendor}
            </span>
          </span>
          <span>
            <Category name={head.category} />
          </span>
          <span className="text-right text-sm font-semibold tabular-nums">
            {live.reduce((sum, l) => sum + (l.seats ?? 0), 0) || "–"}
          </span>
          <span className="text-xs font-normal tabular-nums text-muted">
            {next ? formatDate(next.expireDate) : CYCLE_NAMES[head.billingCycle]}
          </span>
          <span>
            <Chip license={next ?? head} />
          </span>
          <span className="text-right text-sm font-semibold tabular-nums">
            {live.some((l) => l.pricePerYear !== null)
              ? baht(live.reduce((sum, l) => sum + (l.pricePerYear ?? 0), 0))
              : "–"}
          </span>
        </span>
      ),
      description: (
        <div className="overflow-x-auto rounded-xl border border-indigo-100">
          <table className="sheet lots text-[12.5px]">
            <thead>
              <tr>
                <th>รายละเอียด</th>
                <th className="text-right">Seat</th>
                <th>รอบ</th>
                <th>เริ่ม</th>
                <th>หมดอายุ</th>
                <th>คงเหลือ</th>
                <th className="text-right">บาท/ปี</th>
                <th>ผู้ขาย</th>
                <th>การจ่าย</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {group.map((l, i) => (
                <tr key={l.id} className={l.status === "cancelled" ? "text-muted" : "text-ink"}>
                  <td>{l.detail || `ล็อตที่ ${i + 1}`}</td>
                  <td className="text-right tabular-nums">{l.seats ?? "–"}</td>
                  <td className="whitespace-nowrap">{CYCLE_NAMES[l.billingCycle]}</td>
                  <td className="whitespace-nowrap tabular-nums">{formatDate(l.startDate)}</td>
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
                      <button
                        type="button"
                        className="btn-text !px-1.5 text-xs"
                        onClick={() => setRenewing(l)}
                      >
                        ต่ออายุ
                      </button>
                    )}
                    <button type="button" className="btn-text !px-1.5 text-xs" onClick={() => setEditing(l)}>
                      แก้ไข
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    };
  });
  // Picking one program opens it.
  const active = program !== "all" ? program : openKey;

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
        <section className="rounded-3xl bg-gradient-to-br from-indigo-50 via-sky-50 to-violet-50 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
            <select
              className="field !w-auto bg-white"
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
              className="field !w-auto max-w-[260px] bg-white"
              aria-label="โปรแกรม"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
            >
              <option value="all">ทุกโปรแกรม</option>
              {programs.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
            <input
              className="field !w-72 bg-white"
              placeholder="ค้นหาชื่อโปรแกรม / รายละเอียด / ผู้ขาย…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="text-xs text-muted">
              {groups.length} โปรแกรม · {shown.length} รายการ
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div
                className={`${COLUMNS} mb-2 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-500 to-sky-500 py-2.5 pl-[68px] pr-[60px] text-xs font-semibold text-white`}
              >
                <span>โปรแกรม / บริการ</span>
                <span>กลุ่ม</span>
                <span className="text-right">Seat</span>
                <span>หมดอายุ (เร็วสุด)</span>
                <span>คงเหลือ</span>
                <span className="text-right">บาท/ปี</span>
              </div>
              {items.length === 0 ? (
                <p className="rounded-2xl bg-white p-6 text-center text-sm text-muted">ไม่พบรายการ</p>
              ) : (
                <BouncyAccordion
                  items={items}
                  value={active}
                  onValueChange={(key) => {
                    setOpenKey(key);
                    if (program !== "all" && key !== program) setProgram("all");
                  }}
                  classNames={{
                    item: "border-b border-line/70 shadow-sm",
                    trigger: "min-h-[60px] hover:bg-indigo-50/60",
                    icon: "h-8 w-8",
                    title: "overflow-visible whitespace-normal text-[13px] font-normal",
                    chevron: "rounded-full bg-indigo-50 text-indigo-600",
                    description: "text-[13px] leading-normal text-ink",
                  }}
                />
              )}
            </div>
          </div>
        </section>
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
