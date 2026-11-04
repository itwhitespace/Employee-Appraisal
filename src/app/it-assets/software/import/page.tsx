"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { useLeaveGuard } from "@/components/useLeaveGuard";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { CYCLE_NAMES, PAYMENT_NAMES, productKey, type SoftwareLicense } from "@/lib/software";
import { LicenseImportError, readLicenseWorkbook, type LicenseLine } from "@/lib/software-import";

const baht = (n: number | null) => (n === null ? "–" : Math.round(n).toLocaleString("en-US"));

/** Already in the system: same program, detail and expiry date. */
const sameAs = (line: LicenseLine, l: SoftwareLicense) =>
  productKey(l.name) === productKey(line.input.name) &&
  l.detail.trim() === line.input.detail.trim() &&
  l.expireDate === line.input.expireDate;

export default function SoftwareImportPage() {
  const confirm = useConfirm();
  const [existing, setExisting] = useState<SoftwareLicense[] | null>(null);
  const [lines, setLines] = useState<LicenseLine[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useLeaveGuard(lines !== null && done === null);

  useEffect(() => {
    api
      .licenses()
      .then((r) => setExisting(r.licenses))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (!existing) {
    return <div className="card p-8 text-center text-muted">{error ?? "กำลังโหลด…"}</div>;
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setDone(null);
    setReading(true);
    try {
      const { lines: read } = await readLicenseWorkbook(file);
      setLines(read);
      setFileName(file.name);
      // Everything to import starts ticked, except what is already in the system.
      setTicked(
        Object.fromEntries(read.map((l) => [l.sheetRow, !l.skip && !existing.some((e) => sameAs(l, e))])),
      );
    } catch (e) {
      setLines(null);
      setError(e instanceof LicenseImportError ? e.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setReading(false);
    }
  };

  const toImport = (lines ?? []).filter((l) => !l.skip);
  const skipped = (lines ?? []).filter((l) => l.skip);
  const chosen = toImport.filter((l) => ticked[l.sheetRow]);

  const save = async () => {
    const agreed = await confirm({
      title: "นำเข้า License?",
      message: `เพิ่ม ${chosen.length} รายการเข้าระบบ · รหัสผ่านใน Remark / Detail ไม่ถูกนำเข้า`,
      confirmLabel: "นำเข้า",
    });
    if (!agreed) return;
    setSaving(true);
    try {
      const result = await api.importLicenses(chosen.map((l) => l.input));
      setExisting(result.licenses);
      setDone(`นำเข้าแล้ว ${result.created} รายการ`);
      setLines(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <Link href="/it-assets/software" className="text-sm text-accent hover:underline">
          ← Software / License
        </Link>
        <h1 className="page-title mt-1">นำเข้า License จาก Excel</h1>
        <p className="mt-1 text-sm text-muted">
          อ่านชีท License Overview · นำเข้าเฉพาะแถวที่มีเลข No. · ไม่นำเข้าแถวสีแดง (ยกเลิก) และค่าโฆษณา ·
          ไฟล์ถูกอ่านในเครื่องนี้ · รหัสผ่านใน Remark / Detail ไม่ถูกนำเข้า
        </p>
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
          {lines && (
            <span className="text-sm text-muted">
              {fileName} · นำเข้าได้ {toImport.length} · ข้าม {skipped.length}
            </span>
          )}
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="text-sm font-medium text-emerald-700">
            {done} ·{" "}
            <Link href="/it-assets/software" className="underline">
              ดูรายการ License
            </Link>
          </p>
        )}
      </section>

      {lines && (
        <section className="card overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight">ตรวจสอบก่อนนำเข้า</h2>
              <p className="text-xs text-muted">
                ⚑ = ควรตรวจ · รายการที่มีในระบบแล้ว (ชื่อ รายละเอียด และวันหมดอายุตรงกัน) ไม่ถูกติ๊ก
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={saving || chosen.length === 0}
              onClick={() => void save()}
            >
              {saving ? "กำลังนำเข้า…" : `นำเข้า ${chosen.length} รายการ`}
            </button>
          </header>
          <div className="max-h-[70vh] overflow-auto border-t border-line">
            <table className="sheet min-w-[1150px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="w-10" />
                  <th className="w-14 text-center">แถว</th>
                  <th>โปรแกรม / รายละเอียด</th>
                  <th>กลุ่ม</th>
                  <th className="text-right">Seat</th>
                  <th>รอบ</th>
                  <th>หมดอายุ</th>
                  <th className="text-right">บาท/ปี</th>
                  <th>ผู้ขาย / การจ่าย</th>
                  <th>ควรตรวจ</th>
                </tr>
              </thead>
              <tbody>
                {toImport.map((l) => {
                  const dup = existing.some((e) => sameAs(l, e));
                  return (
                    <tr key={l.sheetRow} className={dup ? "text-muted" : ""}>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          aria-label={`นำเข้าแถว ${l.sheetRow}`}
                          checked={Boolean(ticked[l.sheetRow])}
                          onChange={(e) => setTicked({ ...ticked, [l.sheetRow]: e.target.checked })}
                        />
                      </td>
                      <td className="text-center tabular-nums text-faint">{l.sheetRow}</td>
                      <td>
                        <div className="font-medium">{l.input.name}</div>
                        {l.input.detail && <div className="text-[11px] text-faint">{l.input.detail}</div>}
                      </td>
                      <td className="whitespace-nowrap text-xs">{l.input.category}</td>
                      <td className="text-right tabular-nums">{l.input.seats ?? "–"}</td>
                      <td className="whitespace-nowrap">
                        {CYCLE_NAMES[l.input.billingCycle]}
                        {l.input.renewDay && (
                          <div className="text-[11px] text-faint">ทุกวันที่ {l.input.renewDay}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap tabular-nums">{formatDate(l.input.expireDate)}</td>
                      <td className="text-right tabular-nums">{baht(l.input.pricePerYear)}</td>
                      <td className="text-xs">
                        {l.input.vendor || "–"}
                        <div className="text-faint">
                          {PAYMENT_NAMES[l.input.paymentMethod]} {l.input.cardLabel}
                        </div>
                      </td>
                      <td className="text-[11.5px] text-amber-800">
                        {dup && <div className="text-muted">มีในระบบแล้ว</div>}
                        {l.flags.map((f) => (
                          <div key={f}>⚑ {f}</div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {skipped.length > 0 && (
            <details className="border-t border-line">
              <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
                ไม่นำเข้า {skipped.length} แถว
              </summary>
              <ul className="divide-y divide-line border-t border-line text-sm">
                {skipped.map((l) => (
                  <li key={l.sheetRow} className="flex justify-between gap-2 px-5 py-2">
                    <span>
                      แถว {l.sheetRow} · {l.input.name}
                    </span>
                    <span className="text-muted">{l.skip}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
