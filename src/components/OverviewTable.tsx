import Link from "next/link";
import { DEPARTMENTS } from "@/lib/constants";
import { displayName, formatScore } from "@/lib/format";
import type { OverviewRow } from "@/lib/overview";
import { isConfirmed } from "@/lib/evaluation";
import type { Cycle } from "@/lib/types";
import IconButton from "./IconButton";
import StatusBadge from "./StatusBadge";

interface OverviewTableProps {
  rows: OverviewRow[];
  /** The cycle the rows belong to; a past one links to its read-only forms. */
  cycle: Cycle;
  /** Label of the link to each form, by who is looking. */
  viewer: "supervisor" | "admin";
  /** Adds a "clear this form" button to each row that has a form. */
  onClear?: (row: OverviewRow) => void;
  /** Leaves the position out of the name column. */
  hidePosition?: boolean;
  /** Adds a PDF column with a download button on each confirmed form. */
  onPdf?: (row: OverviewRow) => void;
  /** Employee whose PDF is being made; every PDF button waits meanwhile. */
  pdfBusyId?: string | null;
  /** Adds a tick box per row, for acting on several forms at once. */
  selection?: {
    ids: Set<string>;
    onToggle: (employeeId: string) => void;
    onToggleAll: (checked: boolean) => void;
  };
  /** Adds an "approve" button to each row. */
  onApprove?: (row: OverviewRow) => void;
}

function actionLabel(row: OverviewRow, viewer: OverviewTableProps["viewer"], cycle: Cycle): string {
  if (viewer === "admin") return "เปิดดู";
  return isConfirmed(row.status) || !cycle.current ? "ดูผล" : "ประเมิน";
}

/** Appraisal status and scores per employee; shared by the admin dashboard and the supervisor's team page. */
export default function OverviewTable({
  rows,
  cycle,
  viewer,
  onClear,
  hidePosition,
  onPdf,
  pdfBusyId,
  selection,
  onApprove,
}: OverviewTableProps) {
  const allSelected = selection !== undefined && rows.length > 0 && rows.every((r) => selection.ids.has(r.employee.id));
  const query = cycle.current ? "" : `?cycle=${encodeURIComponent(cycle.id)}`;
  return (
    <div className="overflow-x-auto">
      <table className="sheet min-w-[1040px]">
        <thead>
          <tr>
            {selection && (
              <th className="w-12 text-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent"
                  aria-label="เลือกทั้งหมด"
                  checked={allSelected}
                  onChange={(e) => selection.onToggleAll(e.target.checked)}
                />
              </th>
            )}
            <th className="w-20">รหัส</th>
            <th className="min-w-[220px]">{hidePosition ? "ชื่อ-สกุล" : "ชื่อ-สกุล / ตำแหน่ง"}</th>
            <th>ฝ่าย</th>
            <th className="w-28">Level</th>
            {viewer === "admin" && <th>ผู้ประเมิน</th>}
            <th className="w-36">สถานะ</th>
            <th className="w-20 text-center">Self</th>
            <th className="w-28 text-center">Performance</th>
            <th className="w-24 text-center">Potential</th>
            <th className="w-40">9-Box</th>
            {onPdf && <th className="w-14 text-center">PDF</th>}
            <th className={onClear ? (onApprove ? "w-40" : "w-32") : "w-20"} aria-label="แบบประเมิน" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={(viewer === "admin" ? 11 : 10) + (onPdf ? 1 : 0) + (selection ? 1 : 0)}
                className="py-6 text-center text-muted"
              >
                ไม่พบพนักงาน
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const { employee } = row;
            return (
              <tr key={employee.id}>
                {selection && (
                  <td className="text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-accent"
                      aria-label={`เลือก ${displayName(employee)}`}
                      checked={selection.ids.has(employee.id)}
                      onChange={() => selection.onToggle(employee.id)}
                    />
                  </td>
                )}
                <td className="tabular-nums text-muted">{employee.code}</td>
                <td>
                  <div className="font-semibold">{displayName(employee)}</div>
                  {!hidePosition && <div className="text-xs text-muted">{employee.position}</div>}
                </td>
                <td className="whitespace-nowrap">{DEPARTMENTS.find((d) => d.id === employee.departmentId)?.name}</td>
                <td>{row.levelName ?? "–"}</td>
                {viewer === "admin" && <td className="whitespace-nowrap">{row.supervisorName ?? "–"}</td>}
                <td>
                  <StatusBadge status={row.status} />
                </td>
                <td className="text-center tabular-nums text-muted">
                  {formatScore(row.selfPerformance)}
                </td>
                <td className="text-center text-sm font-semibold tabular-nums">
                  {formatScore(row.performance)}
                </td>
                <td className="text-center text-sm font-semibold tabular-nums text-accent">
                  {formatScore(row.potential)}
                </td>
                <td>{row.position?.label ?? <span className="text-faint">รอคะแนน</span>}</td>
                {onPdf && (
                  <td className="!py-1.5 text-center">
                    {isConfirmed(row.status) ? (
                      <IconButton
                        icon="download"
                        label={pdfBusyId === employee.id ? "กำลังสร้าง PDF…" : "ดาวน์โหลด PDF"}
                        disabled={Boolean(pdfBusyId)}
                        onClick={() => onPdf(row)}
                      />
                    ) : (
                      <span className="text-faint">–</span>
                    )}
                  </td>
                )}
                <td className="whitespace-nowrap text-right">
                  <Link href={`/evaluate/${employee.id}${query}`} className="btn-text text-[13px]">
                    {actionLabel(row, viewer, cycle)}
                  </Link>
                  {onApprove && row.status === "completed" && (
                    <IconButton icon="save" label="อนุมัติผล" onClick={() => onApprove(row)} />
                  )}
                  {onClear && (
                    <IconButton
                      icon="delete"
                      label={row.status === "not_started" ? "ยังไม่มีแบบประเมินให้ล้าง" : "ล้างแบบประเมิน"}
                      tone="danger"
                      disabled={row.status === "not_started"}
                      onClick={() => onClear(row)}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
