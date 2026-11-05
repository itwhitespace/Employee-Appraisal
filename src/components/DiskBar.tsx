import type { Device } from "@/lib/devices";

/**
 * Space on the system drive as a bar, like the drive bar in Windows Explorer: the filled part is
 * the space in use, green normally, amber when under 20 % is free and red under 10 %.
 */
export function DiskBar({ device, wide }: { device: Device; wide?: boolean }) {
  const free = device.diskFreeGb;
  const total = device.diskTotalGb;
  if (free === null) return <span className="text-faint">–</span>;
  if (!total) return <span className="tabular-nums">{Math.round(free)} GB ว่าง</span>;
  const share = Math.min(1, Math.max(0, free / total));
  const tone = share < 0.1 ? "bg-red-500" : share < 0.2 ? "bg-amber-500" : "bg-emerald-500";
  const text = share < 0.1 ? "text-red-600 font-semibold" : share < 0.2 ? "text-amber-700" : "text-ink";
  return (
    <div
      className={wide ? "w-full max-w-[260px]" : "ml-auto w-[160px]"}
      title={`ว่าง ${Math.round(share * 100)}%`}
    >
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${(1 - share) * 100}%` }} />
      </div>
      <div className="mt-0.5 whitespace-nowrap text-[11px] tabular-nums">
        <span className={text}>
          ว่าง {free < 10 ? free.toFixed(1) : Math.round(free)} GB {Math.round(share * 100)}%
        </span>
        <span className="text-faint"> · จาก {Math.round(total)} GB</span>
      </div>
    </div>
  );
}
