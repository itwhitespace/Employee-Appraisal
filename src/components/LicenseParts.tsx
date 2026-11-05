"use client";

import { formatDate } from "@/lib/format";
import {
  CATEGORIES,
  CATEGORY_DOT,
  daysLeft,
  productKey,
  standingOf,
  type SoftwareLicense,
} from "@/lib/software";

/** Pieces shared by the IT Assets pages. */

export const baht = (n: number | null) => (n === null ? "–" : Math.round(n).toLocaleString("en-US"));

export function Chip({ license }: { license: SoftwareLicense }) {
  const s = standingOf(license);
  return <span className={`chip whitespace-nowrap ${s.tone}`}>{s.label}</span>;
}

export function Category({ name }: { name: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm ${
        CATEGORY_DOT[name] ?? "bg-slate-400"
      }`}
    >
      {name}
    </span>
  );
}

/** The license tiles, what is due soon (with a renew button) and the cost by category. */
export function LicenseSummary({
  licenses,
  onRenew,
}: {
  licenses: SoftwareLicense[];
  onRenew: (license: SoftwareLicense) => void;
}) {
  const active = licenses.filter((l) => l.status === "active");
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

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card border-t-4 !border-t-indigo-500 bg-gradient-to-br from-indigo-50 to-white px-5 py-4">
          <div className="text-xs font-medium text-indigo-700">License ที่ใช้งาน</div>
          <div className="text-3xl font-semibold tabular-nums text-indigo-950">{active.length}</div>
          <div className="text-xs text-indigo-700/70">{products} โปรแกรม / บริการ</div>
        </div>
        <div className="card border-t-4 !border-t-emerald-500 bg-gradient-to-br from-emerald-50 to-white px-5 py-4">
          <div className="text-xs font-medium text-emerald-700">ค่า Software ต่อปี</div>
          <div className="text-3xl font-semibold tabular-nums text-emerald-950">฿{baht(total)}</div>
          <div className="text-xs text-emerald-700/70">ไม่รวมรายการที่ยังไม่มีราคา</div>
        </div>
        <div
          className={`card border-t-4 !border-t-red-500 bg-gradient-to-br from-red-50 to-white px-5 py-4 ${
            dueWithin(30).length + expired.length ? "ring-2 ring-red-200" : ""
          }`}
        >
          <div className="text-xs font-medium text-red-600">ครบกำหนดใน 30 วัน</div>
          <div className="text-3xl font-semibold tabular-nums text-red-600">{dueWithin(30).length}</div>
          <div className="text-xs text-red-700/70">
            ภายใน 90 วัน {dueWithin(90).length} · เลยกำหนดแล้ว {expired.length}
          </div>
        </div>
        <div className="card border-t-4 !border-t-amber-500 bg-gradient-to-br from-amber-50 to-white px-5 py-4">
          <div className="text-xs font-medium text-amber-700">ข้อมูลไม่ครบ</div>
          <div className="text-3xl font-semibold tabular-nums text-amber-600">{noPrice.length}</div>
          <div className="text-xs text-amber-700/70">ยังไม่มีราคา</div>
        </div>
      </div>

      {licenses.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-5">
          <section className="card overflow-hidden lg:col-span-3">
            <h2 className="bg-gradient-to-r from-rose-500 to-orange-400 px-5 py-2.5 text-sm font-semibold text-white">
              ใกล้ครบกำหนด (90 วัน) และเลยกำหนด
            </h2>
            <div className="px-5 py-2">
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
                      onClick={() => onRenew(l)}
                    >
                      ต่ออายุ
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="card overflow-hidden lg:col-span-2">
            <h2 className="bg-gradient-to-r from-indigo-600 to-sky-500 px-5 py-2.5 text-sm font-semibold text-white">
              ค่า Software ต่อปีตามกลุ่ม
            </h2>
            <div className="px-5 py-3">
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
            </div>
          </section>
        </div>
      )}
    </>
  );
}
