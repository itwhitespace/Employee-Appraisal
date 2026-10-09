import Link from "next/link";
import { DEPARTMENTS } from "@/lib/constants";
import { formatScore } from "@/lib/format";
import type { OverviewRow } from "@/lib/overview";
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
}

function actionLabel(row: OverviewRow, viewer: OverviewTableProps["viewer"], cycle: Cycle): string {
  if (viewer === "admin") return "เปิดดู";
  return row.status === "completed" || !cycle.current ? "ดูผล" : "ประเมิน";
}

/** Appraisal status and scores per employee; shared by the admin dashboard and the supervisor's team page. */
export default function OverviewTable({ rows, cycle, viewer, onClear }: OverviewTableProps) {
  const query = cycle.current ? "" : `?cycle=${encodeURIComponent(cycle.id)}`;
  return (
    <div className="overflow-x-auto">
      <table className="sheet min-w-[1040px]">
        <thead>
          <tr>
            <th className="w-20">รหัส</th>
            <th className="min-w-[220px]">ชื่อ-สกุล / ตำแหน่ง</th>
            <th>ฝ่าย</th>
            <th className="w-28">Level</th>
            {viewer === "admin" && <th>ผู้ประเมิน</th>}
            <th className="w-36">สถานะ</th>
            <th className="w-20 text-center">Self</th>
            <th className="w-28 text-center">Performance</th>
            <th className="w-24 text-center">Potential</th>
            <th className="w-40">9-Box</th>
            <th className={onClear ? "w-32" : "w-20"} aria-label="แบบประเมิน" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={viewer === "admin" ? 11 : 10} className="py-6 text-center text-muted">
                ไม่พบพนักงาน
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const { employee } = row;
            return (
              <tr key={employee.id}>
                <td className="tabular-nums text-muted">{employee.code}</td>
                <td>
                  <div className="font-semibold">{employee.name}</div>
                  <div className="text-xs text-muted">{employee.position}</div>
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
                <td className="whitespace-nowrap text-right">
                  <Link href={`/evaluate/${employee.id}${query}`} className="btn-text text-[13px]">
                    {actionLabel(row, viewer, cycle)}
                  </Link>
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
