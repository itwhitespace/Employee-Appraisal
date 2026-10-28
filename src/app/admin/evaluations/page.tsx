"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import OverviewTable from "@/components/OverviewTable";
import { api, errorMessage } from "@/lib/api";
import { departmentRank } from "@/lib/evaluation";
import { displayName, formatCycle } from "@/lib/format";
import { choosePdfTarget, fetchPdf, pdfFileName, savePdf } from "@/lib/pdf";
import { overviewRows, useOverview, type OverviewRow, type OverviewStatus } from "@/lib/overview";

type Filter = "not_submitted" | "self_submitted" | "completed" | "approved";

/** A form the employee is still filling in is listed with those not started yet. */
const filterOf = (status: OverviewStatus): Filter =>
  status === "self_submitted" || status === "completed" || status === "approved"
    ? status
    : "not_submitted";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "not_submitted", label: "ยังไม่เริ่ม" },
  { id: "self_submitted", label: "รอผู้ประเมิน" },
  { id: "completed", label: "รออนุมัติ" },
  { id: "approved", label: "เสร็จสิ้น" },
];

/** By department, then the most senior first. */
const byDepartment = (a: OverviewRow, b: OverviewRow) =>
  departmentRank(a.employee.departmentId) - departmentRank(b.employee.departmentId) ||
  b.employee.level - a.employee.level ||
  a.employee.code.localeCompare(b.employee.code);

const segment = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-sm transition ${
    active ? "bg-ink font-medium text-white" : "bg-black/5 text-ink hover:bg-black/10"
  }`;

export default function EvaluationsPage() {
  const confirm = useConfirm();
  const { data, error, reload } = useOverview();
  const [filter, setFilter] = useState<Filter>("not_submitted");
  const [notice, setNotice] = useState<string | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);

  const rows = useMemo(() => (data ? overviewRows(data).sort(byDepartment) : []), [data]);

  if (error) return <div className="card p-8 text-center text-red-500">{error}</div>;
  if (!data) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const clear = async (row: OverviewRow) => {
    const agreed = await confirm({
      title: "ล้างแบบประเมินนี้?",
      message: `${displayName(row.employee)} (${row.employee.code}) — คะแนนและความเห็นทั้งหมดในรอบ ${data.cycle.id} จะถูกลบถาวร พนักงานต้องเริ่มกรอกใหม่`,
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

  const shown = rows.filter((row) => filterOf(row.status) === filter);
  const chosen = shown.filter((row) => selected.has(row.employee.id));

  /** Approves one form or several; the employees then see their whole form. */
  const approve = async (targets: OverviewRow[]) => {
    if (targets.length === 0) return;
    const agreed = await confirm({
      title: targets.length === 1 ? "อนุมัติผลการประเมิน?" : `อนุมัติผลการประเมิน ${targets.length} ใบ?`,
      message:
        targets.length === 1
          ? `${displayName(targets[0].employee)} จะเห็นแบบประเมินฉบับเต็ม รวมคะแนนและความเห็นทั้งหมด`
          : "พนักงานทุกคนที่เลือกจะเห็นแบบประเมินฉบับเต็ม รวมคะแนนและความเห็นทั้งหมด",
      confirmLabel: "อนุมัติ",
    });
    if (!agreed) return;
    setApproving(true);
    const failed: string[] = [];
    for (const row of targets) {
      try {
        await api.setApproval(row.employee.id, "approve");
      } catch (e) {
        failed.push(`${displayName(row.employee)}: ${errorMessage(e)}`);
      }
    }
    setApproving(false);
    setSelected(new Set());
    await reload();
    setNotice(failed.length > 0 ? `อนุมัติไม่สำเร็จ ${failed.length} ใบ — ${failed.join(", ")}` : null);
  };

  const downloadPdf = async (row: OverviewRow) => {
    try {
      // The "Save As" dialog has to open straight from the click.
      const target = await choosePdfTarget(pdfFileName(data.cycle, row.employee));
      if (!target) return;
      setPdfBusyId(row.employee.id);
      await savePdf(target, await fetchPdf(row.employee.id, null));
      setNotice(null);
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setPdfBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">รายการประเมิน</h1>
        <p className="mt-1 text-sm text-muted">รอบประเมิน {formatCycle(data.cycle)}</p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="กรองตามสถานะ">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={filter === option.id}
            onClick={() => {
              setFilter(option.id);
              setSelected(new Set());
            }}
            className={segment(filter === option.id)}
          >
            {option.label}{" "}
            <span className="tabular-nums opacity-60">
              {rows.filter((row) => filterOf(row.status) === option.id).length}
            </span>
          </button>
        ))}
      </div>

      {filter === "completed" && shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={approving || chosen.length === 0}
            onClick={() => void approve(chosen)}
          >
            {approving ? "กำลังอนุมัติ…" : `อนุมัติที่เลือก (${chosen.length})`}
          </button>
          <span className="text-sm text-muted">
            ตรวจผลแล้วติ๊กเลือก หรือกดไอคอนอนุมัติท้ายแถว พนักงานจะเห็นแบบประเมินฉบับเต็มหลังอนุมัติ
          </span>
        </div>
      )}

      {notice && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {notice}
        </p>
      )}

      <section className="card overflow-hidden">
        <OverviewTable
          rows={shown}
          cycle={data.cycle}
          viewer="admin"
          hidePosition
          onPdf={(row) => void downloadPdf(row)}
          pdfBusyId={pdfBusyId}
          onClear={(row) => void clear(row)}
          onApprove={(row) => void approve([row])}
          selection={
            filter === "completed"
              ? {
                  ids: selected,
                  onToggle: (id) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    }),
                  onToggleAll: (checked) =>
                    setSelected(checked ? new Set(shown.map((row) => row.employee.id)) : new Set()),
                }
              : undefined
          }
        />
      </section>
    </div>
  );
}
