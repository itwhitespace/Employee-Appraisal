"use client";

import { useMemo } from "react";
import OverviewTable from "@/components/OverviewTable";
import { useAuth } from "@/lib/auth";
import { CURRENT_CYCLE, CYCLE_PERIOD } from "@/lib/constants";
import { isEmployee } from "@/lib/evaluation";
import { overviewRow, useOverview } from "@/lib/overview";

export default function TeamPage() {
  const { user } = useAuth();
  const { data, error } = useOverview();

  const rows = useMemo(() => {
    if (!data || !user) return [];
    return data.users
      .filter(isEmployee)
      .filter((e) => e.supervisorId === user.id)
      .map((e) => overviewRow(e, data));
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
      <div>
        <h1 className="page-title">ทีมของฉัน</h1>
        <p className="mt-1 text-sm text-muted">
          รอบประเมิน {CURRENT_CYCLE} ({CYCLE_PERIOD}) · เปิดแบบประเมินของพนักงานเพื่อให้คะแนนในคอลัมน์
          Supervisor
        </p>
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
        <OverviewTable rows={rows} viewer="supervisor" />
      </section>
    </div>
  );
}
