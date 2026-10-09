"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import OverviewTable from "@/components/OverviewTable";
import { api, errorMessage } from "@/lib/api";
import { formatCycle } from "@/lib/format";
import { overviewRows, useOverview, type OverviewRow, type OverviewStatus } from "@/lib/overview";

const FILTERS: { status: OverviewStatus; label: string }[] = [
  { status: "not_started", label: "ยังไม่เริ่ม" },
  { status: "draft", label: "พนักงานกำลังกรอก" },
  { status: "self_submitted", label: "รอผู้ประเมิน" },
  { status: "completed", label: "เสร็จสิ้น" },
];

const segment = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-sm transition ${
    active ? "bg-ink font-medium text-white" : "bg-black/5 text-ink hover:bg-black/10"
  }`;

export default function EvaluationsPage() {
  const confirm = useConfirm();
  const { data, error, reload } = useOverview();
  const [status, setStatus] = useState<OverviewStatus>("not_started");
  const [notice, setNotice] = useState<string | null>(null);

  const rows = useMemo(() => (data ? overviewRows(data) : []), [data]);

  if (error) return <div className="card p-8 text-center text-red-500">{error}</div>;
  if (!data) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const clear = async (row: OverviewRow) => {
    const agreed = await confirm({
      title: "ล้างแบบประเมินนี้?",
      message: `${row.employee.name} (${row.employee.code}) — คะแนนและความเห็นทั้งหมดในรอบ ${data.cycle.id} จะถูกลบถาวร พนักงานต้องเริ่มกรอกใหม่`,
      confirmLabel: "ล้างแบบประเมิน",
      tone: "danger",
    });
    if (!agreed) return;
    try {
      await api.clearEvaluation(row.employee.id);
      await reload();
      setNotice(null);
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">รายการประเมิน</h1>
        <p className="mt-1 text-sm text-muted">รอบประเมิน {formatCycle(data.cycle)}</p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="กรองตามสถานะ">
        {FILTERS.map((filter) => (
          <button
            key={filter.status}
            type="button"
            aria-pressed={status === filter.status}
            onClick={() => setStatus(filter.status)}
            className={segment(status === filter.status)}
          >
            {filter.label}{" "}
            <span className="tabular-nums opacity-60">
              {rows.filter((row) => row.status === filter.status).length}
            </span>
          </button>
        ))}
      </div>

      {notice && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {notice}
        </p>
      )}

      <section className="card overflow-hidden">
        <OverviewTable
          rows={rows.filter((row) => row.status === status)}
          cycle={data.cycle}
          viewer="admin"
          onClear={(row) => void clear(row)}
        />
      </section>
    </div>
  );
}
