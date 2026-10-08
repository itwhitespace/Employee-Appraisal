import type { OverviewStatus } from "@/lib/overview";

const BADGES: Record<OverviewStatus, { label: string; className: string }> = {
  not_started: { label: "ยังไม่เริ่ม", className: "bg-black/5 text-muted" },
  draft: { label: "พนักงานกำลังกรอก", className: "bg-orange-50 text-orange-700" },
  self_submitted: { label: "รอผู้ประเมิน", className: "bg-accent-soft text-accent" },
  completed: { label: "เสร็จสิ้น", className: "bg-emerald-50 text-emerald-700" },
};

export default function StatusBadge({ status }: { status: OverviewStatus }) {
  const badge = BADGES[status];
  return <span className={`chip whitespace-nowrap ${badge.className}`}>{badge.label}</span>;
}
