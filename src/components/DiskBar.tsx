import type { Device, VolumeInfo } from "@/lib/devices";

const gb = (n: number) => (n < 10 ? n.toFixed(1) : String(Math.round(n)));

/**
 * One drive as a small box, like Disk Management: the bar on top fills with the space in use,
 * green normally, amber when under 20 % is free and red under 10 %.
 */
function VolumeBox({ volume, wide }: { volume: VolumeInfo; wide?: boolean }) {
  const { drive, label, freeGb: free, totalGb: total } = volume;
  if (free === null) return null;
  const share = total ? Math.min(1, Math.max(0, free / total)) : null;
  const tone =
    share === null
      ? "bg-slate-300"
      : share < 0.1
        ? "bg-red-500"
        : share < 0.2
          ? "bg-amber-500"
          : "bg-emerald-500";
  const text =
    share !== null && share < 0.1
      ? "text-red-600 font-semibold"
      : share !== null && share < 0.2
        ? "text-amber-700 font-medium"
        : "text-muted";
  const bar = (
    <div className="h-1.5 bg-slate-200">
      <div className={`h-full ${tone}`} style={{ width: `${share === null ? 0 : (1 - share) * 100}%` }} />
    </div>
  );
  // In the table: one line, so the row stays as low as the others; the rest in the tooltip.
  if (!wide)
    return (
      <div
        className="w-[128px] overflow-hidden rounded border border-line bg-white"
        title={`${label ? `${label} (${drive})` : drive} · ว่าง ${gb(free)} GB${
          share !== null ? ` (${Math.round(share * 100)}%)` : ""
        }${total ? ` จาก ${Math.round(total)} GB` : ""}`}
      >
        {bar}
        <div className="whitespace-nowrap px-1.5 py-0.5 text-[11px] leading-tight tabular-nums">
          <span className="font-semibold text-ink">{drive}</span>{" "}
          <span className={text}>ว่าง {gb(free)}</span>
          {total ? <span className="text-faint"> / {Math.round(total)} GB</span> : " GB"}
        </div>
      </div>
    );
  return (
    <div className="w-[150px] overflow-hidden rounded-md border border-line bg-white text-left">
      <div className="h-1.5 bg-slate-200">
        <div className={`h-full ${tone}`} style={{ width: `${share === null ? 0 : (1 - share) * 100}%` }} />
      </div>
      <div className="px-1.5 py-1 text-[11px] leading-tight tabular-nums">
        <div className="truncate font-semibold text-ink" title={label ? `${label} (${drive})` : drive}>
          {label ? `${label} (${drive})` : drive}
          {total ? <span className="font-normal text-faint"> {Math.round(total)} GB</span> : null}
        </div>
        <div className={text}>
          ว่าง {gb(free)} GB{share !== null && ` · ${Math.round(share * 100)}%`}
        </div>
      </div>
    </div>
  );
}

/** Every drive of the computer side by side, C: first; an older agent sends the system drive only. */
export function DiskBar({ device, wide }: { device: Device; wide?: boolean }) {
  const volumes: VolumeInfo[] = device.volumes.length
    ? device.volumes
    : device.diskFreeGb === null
      ? []
      : [{ drive: "C:", label: "", freeGb: device.diskFreeGb, totalGb: device.diskTotalGb }];
  if (!volumes.length) return <span className="text-faint">–</span>;
  return (
    <div className={`flex gap-1.5 ${wide ? "flex-wrap" : ""}`}>
      {volumes.map((v) => (
        <VolumeBox key={v.drive} volume={v} wide={wide} />
      ))}
    </div>
  );
}
