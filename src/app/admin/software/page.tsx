"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LicenseDialog, RenewDialog } from "@/components/LicenseDialog";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  CATEGORIES,
  CATEGORY_DOT,
  CYCLE_NAMES,
  daysLeft,
  PAYMENT_NAMES,
  productKey,
  standingOf,
  todayIso,
  type SoftwareLicense,
} from "@/lib/software";

const baht = (n: number | null) => (n === null ? "–" : Math.round(n).toLocaleString("en-US"));

function Chip({ license }: { license: SoftwareLicense }) {
  const s = standingOf(license);
  return <span className={`chip whitespace-nowrap ${s.tone}`}>{s.label}</span>;
}

function Category({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <i className={`h-2 w-2 rounded-full ${CATEGORY_DOT[name] ?? "bg-slate-400"}`} />
      {name}
    </span>
  );
}

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

  const active = useMemo(() => (licenses ?? []).filter((l) => l.status === "active"), [licenses]);

  if (error) return <div className="card p-8 text-center text-red-500">{error}</div>;
  if (!licenses) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const dueWithin = (days: number) =>
    active.filter((l) => {
      const d = daysLeft(l);
      return d !== null && d >= 0 && d <= days;
    });
  const expired = active.filter((l) => (daysLeft(l) ?? 0) < 0);
  const noPrice = active.filter((l) => l.pricePerYear === null && l.billingCycle !== "perpetual");
  const total = active.reduce((sum, l) => sum + (l.pricePerYear ?? 0), 0);
  const byCategory = CATEGORIES.map((c) => ({
    name: c,
    total: active.filter((l) => l.category === c).reduce((sum, l) => sum + (l.pricePerYear ?? 0), 0),
  })).filter((c) => c.total > 0);
  const top = Math.max(1, ...byCategory.map((c) => c.total));
  const soon = [...expired, ...dueWithin(90)].sort((a, b) => (daysLeft(a) ?? 0) - (daysLeft(b) ?? 0));
  const products = new Set(active.map((l) => productKey(l.name))).size;

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

  const row = (l: SoftwareLicense, inGroup: boolean, index: number) => (
    <tr
      key={l.id}
      className={`${inGroup ? "bg-slate-50/70" : ""} ${l.status === "cancelled" ? "text-muted" : ""}`}
    >
      <td className={inGroup ? "pl-9" : ""}>
        <button type="button" className="text-left hover:underline" onClick={() => setEditing(l)}>
          <span className={inGroup ? "text-[12.5px]" : "font-medium"}>
            {inGroup ? `↳ ${l.detail || `ล็อตที่ ${index + 1}`}` : l.name}
          </span>
        </button>
        {!inGroup && l.detail && <div className="text-[11px] text-faint">{l.detail}</div>}
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
          <Link href="/admin/software/import" className="btn-secondary py-1.5 text-sm">
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card px-5 py-4">
          <div className="text-xs text-muted">License ที่ใช้งาน</div>
          <div className="text-3xl font-semibold tabular-nums">{active.length}</div>
          <div className="text-xs text-faint">{products} โปรแกรม / บริการ</div>
        </div>
        <div className="card px-5 py-4">
          <div className="text-xs text-muted">ค่าใช้จ่ายต่อปี</div>
          <div className="text-3xl font-semibold tabular-nums">฿{baht(total)}</div>
          <div className="text-xs text-faint">ไม่รวมรายการที่ยังไม่มีราคา</div>
        </div>
        <div
          className={`card px-5 py-4 ${dueWithin(30).length + expired.length ? "ring-2 ring-red-200" : ""}`}
        >
          <div className="text-xs text-red-600">ครบกำหนดใน 30 วัน</div>
          <div className="text-3xl font-semibold tabular-nums text-red-600">{dueWithin(30).length}</div>
          <div className="text-xs text-faint">
            ภายใน 90 วัน {dueWithin(90).length} · เลยกำหนดแล้ว {expired.length}
          </div>
        </div>
        <div className="card px-5 py-4">
          <div className="text-xs text-amber-700">ข้อมูลไม่ครบ</div>
          <div className="text-3xl font-semibold tabular-nums text-amber-600">{noPrice.length}</div>
          <div className="text-xs text-faint">ยังไม่มีราคา</div>
        </div>
      </div>

      {licenses.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          ยังไม่มีรายการ ·{" "}
          <Link href="/admin/software/import" className="text-accent underline">
            Import จาก Excel
          </Link>{" "}
          หรือกด + เพิ่ม License
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-5">
            <section className="card px-5 py-4 lg:col-span-3">
              <h2 className="mb-2 text-sm font-semibold">ใกล้ครบกำหนด (90 วัน) และเลยกำหนด</h2>
              {soon.length === 0 && <p className="text-sm text-muted">ไม่มีรายการ</p>}
              {soon.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-3 border-t border-line py-1.5 text-[13px]"
                >
                  <span className="min-w-0 truncate">
                    {l.name}
                    <span className="text-faint">
                      {l.detail && ` · ${l.detail}`} · {l.seats ?? "–"} seat
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums text-muted">{formatDate(l.expireDate)}</span>
                    <Chip license={l} />
                    <button
                      type="button"
                      className="rounded-md border border-line px-2 py-0.5 text-xs hover:bg-canvas"
                      onClick={() => setRenewing(l)}
                    >
                      ต่ออายุ
                    </button>
                  </span>
                </div>
              ))}
            </section>
            <section className="card px-5 py-4 lg:col-span-2">
              <h2 className="mb-3 text-sm font-semibold">ค่าใช้จ่ายต่อปีตามกลุ่ม</h2>
              {byCategory.map((c) => (
                <div key={c.name} className="mb-2.5">
                  <div className="flex justify-between text-[12.5px]">
                    <span>{c.name}</span>
                    <span className="font-medium tabular-nums">฿{baht(c.total)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-canvas">
                    <div
                      className={`h-2 rounded-full ${CATEGORY_DOT[c.name]}`}
                      style={{ width: `${Math.max(2, (c.total / top) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </section>
          </div>

          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-5 py-3">
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
                      <tr key={`group-${head.id}`}>
                        <td>
                          <span className="font-semibold">{head.name}</span>{" "}
                          <span className="chip ml-1 bg-indigo-50 text-indigo-700">
                            {group.length} รายการ
                          </span>
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
