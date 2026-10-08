"use client";

import { useMemo, useState } from "react";
import CycleSelect from "@/components/CycleSelect";
import OverviewTable from "@/components/OverviewTable";
import { useAuth } from "@/lib/auth";
import { formatCycle } from "@/lib/format";
import { overviewRows, useOverview } from "@/lib/overview";

export default function TeamPage() {
  const { user } = useAuth();
  // null = the current cycle.
  const [cycleId, setCycleId] = useState<string | null>(null);
  const { data, error } = useOverview(cycleId);

  const rows = useMemo(() => {
    if (!data || !user) return [];
    // For a past cycle the server has already narrowed the list to this viewer's people.
    return overviewRows(data).filter(
      (row) =>
        row.employee.id !== user.id &&
        (!data.cycle.current || row.employee.supervisorId === user.id),
    );
  }, [data, user]);

  if (error) return <div className="card p-8 text-center text-red-500">{error}</div>;
  if (!data || !user) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const tiles = [
    { label: "สมาชิกในทีม", value: rows.length },
    { label: "รอคุณประเมิน", value: rows.filter((row) => row.status === "self_submitted").length },
    { label: "เสร็จสิ้น", value: rows.filter((row) => row.status === "completed").length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">ทีมของฉัน</h1>
          <p className="mt-1 text-sm text-muted">
            รอบประเมิน {formatCycle(data.cycle)}
            {data.cycle.current ? (
              " · เปิดแบบประเมินของพนักงานเพื่อให้คะแนนในคอลัมน์ Supervisor"
            ) : (
              <span className="chip ml-2 bg-orange-50 text-orange-700">ย้อนหลัง · ดูได้อย่างเดียว</span>
            )}
          </p>
        </div>
        <CycleSelect
          cycles={data.cycles}
          value={data.cycle.id}
          onChange={(cycle) => setCycleId(cycle.current ? null : cycle.id)}
        />
      </div>

      <section className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="card px-5 py-4">
            <div className="text-xs text-muted">{tile.label}</div>
            <div className="mt-0.5 text-3xl font-semibold tracking-tight tabular-nums">{tile.value}</div>
          </div>
        ))}
      </section>

      <section className="card overflow-hidden">
        <OverviewTable rows={rows} cycle={data.cycle} viewer="supervisor" />
      </section>
    </div>
  );
}
