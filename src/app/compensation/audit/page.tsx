"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { CompensationAuditEntry } from "@/lib/types";

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

export default function CompensationAuditPage() {
  const [audit, setAudit] = useState<CompensationAuditEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .compensationAudit()
      .then((data) => setAudit(data.audit))
      .catch((e) => setLoadError(errorMessage(e)));
  }, []);

  if (loadError) return <div className="card p-8 text-center text-red-500">{loadError}</div>;
  if (!audit) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const query = search.trim().toLowerCase();
  const shown = audit.filter(
    (entry) => !query || `${entry.actorName} ${entry.action}`.toLowerCase().includes(query),
  );

  return (
    <div className="max-w-[1180px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">ประวัติการเข้าถึง</h1>
          <p className="mt-1 text-sm text-muted">
            ทุกครั้งที่มีคนเปิดดูหรือแก้ข้อมูลค่าตอบแทน · {audit.length} รายการล่าสุด
          </p>
        </div>
        <input
          className="field w-64"
          placeholder="ค้นหาชื่อ / การกระทำ"
          aria-label="ค้นหาประวัติ"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="sheet min-w-[640px]">
            <thead>
              <tr>
                <th className="w-48">เวลา</th>
                <th className="w-56">ผู้ใช้</th>
                <th>การกระทำ</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-muted">
                    ไม่พบรายการ
                  </td>
                </tr>
              )}
              {shown.map((entry, index) => (
                <tr key={index}>
                  <td className="whitespace-nowrap tabular-nums text-muted">{dateTime(entry.at)}</td>
                  <td className="font-medium">{entry.actorName}</td>
                  <td>{entry.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
