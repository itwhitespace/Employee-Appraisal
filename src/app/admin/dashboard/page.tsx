"use client";

import { useMemo, useState } from "react";
import NineBoxGrid, { type NineBoxPerson } from "@/components/NineBoxGrid";
import OverviewTable from "@/components/OverviewTable";
import CycleSelect from "@/components/CycleSelect";
import { DEPARTMENTS } from "@/lib/constants";
import { formatCycle, formatScore } from "@/lib/format";
import { overviewRows, useOverview, type OverviewStatus } from "@/lib/overview";
import type { DepartmentId } from "@/lib/types";

export default function DashboardPage() {
  // null = the current cycle.
  const [cycleId, setCycleId] = useState<string | null>(null);
  const { data, error } = useOverview(cycleId);
  const [filter, setFilter] = useState<DepartmentId | "all">("all");

  const rows = useMemo(() => (data ? overviewRows(data) : []), [data]);

  if (error) return <div className="card p-8 text-center text-red-500">{error}</div>;
  if (!data) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const visible = rows.filter((row) => filter === "all" || row.employee.departmentId === filter);
  const scored = visible.filter((row) => row.performance !== null);
  const averagePerformance = scored.length
    ? scored.reduce((sum, row) => sum + (row.performance ?? 0), 0) / scored.length
    : null;
  const countOf = (status: OverviewStatus) => visible.filter((row) => row.status === status).length;

  const people: NineBoxPerson[] = visible.flatMap((row) =>
    row.performance !== null && row.potential !== null
      ? [
          {
            id: row.employee.id,
            name: row.employee.name,
            performance: row.performance,
            potential: row.potential,
            confirmed: row.status === "completed",
          },
        ]
      : [],
  );

  const tiles = [
    { label: "พนักงานทั้งหมด", value: String(visible.length) },
    { label: "เสร็จสิ้น", value: String(countOf("completed")) },
    { label: "รอผู้ประเมิน", value: String(countOf("self_submitted")) },
    { label: "ยังไม่ส่ง", value: String(countOf("draft") + countOf("not_started")) },
    { label: "Performance เฉลี่ย", value: formatScore(averagePerformance) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            รอบประเมิน {formatCycle(data.cycle)}
            {!data.cycle.current && (
              <span className="chip ml-2 bg-orange-50 text-orange-700">ย้อนหลัง · ดูได้อย่างเดียว</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CycleSelect
            cycles={data.cycles}
            value={data.cycle.id}
            onChange={(cycle) => setCycleId(cycle.current ? null : cycle.id)}
          />
          <select
            className="field w-56 bg-white shadow-card"
            aria-label="กรองตามฝ่าย"
            value={filter}
            onChange={(e) => setFilter(e.target.value as DepartmentId | "all")}
          >
            <option value="all">ทุกฝ่าย</option>
            {DEPARTMENTS.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="card px-5 py-4">
            <div className="text-xs text-muted">{tile.label}</div>
            <div className="mt-0.5 text-3xl font-semibold tracking-tight tabular-nums">{tile.value}</div>
          </div>
        ))}
      </section>

      <section className="card overflow-hidden">
        <header className="px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">9-Box Grid</h2>
          <p className="text-xs text-muted">Performance เทียบกับ Potential จากคะแนนของ Supervisor</p>
        </header>
        <div className="border-t border-line p-5">
          <NineBoxGrid people={people} />
        </div>
      </section>

      <section className="card overflow-hidden">
        <header className="px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">ผลการประเมินพนักงาน</h2>
          <p className="text-xs text-muted">{visible.length} คน</p>
        </header>
        <div className="border-t border-line">
          <OverviewTable rows={visible} cycle={data.cycle} viewer="admin" />
        </div>
      </section>
    </div>
  );
}
