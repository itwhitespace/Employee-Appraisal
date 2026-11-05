import type { Device, VolumeInfo } from "@/lib/devices";

/**
 * The space of one drive as a bar, like the drive bar in Windows Explorer: the filled part is the
 * space in use, green normally, amber when under 20 % is free and red under 10 %.
 */
function VolumeBar({ volume, wide }: { volume: VolumeInfo; wide?: boolean }) {
  const { drive, label, freeGb: free, totalGb: total } = volume;
  if (free === null) return null;
  const name = <span className="mr-1 font-semibold text-muted">{drive}</span>;
  if (!total)
    return (
      <div className="text-[11px] tabular-nums">
        {name}ว่าง {Math.round(free)} GB
      </div>
    );
  const share = Math.min(1, Math.max(0, free / total));
  const tone = share < 0.1 ? "bg-red-500" : share < 0.2 ? "bg-amber-500" : "bg-emerald-500";
  const text = share < 0.1 ? "text-red-600 font-semibold" : share < 0.2 ? "text-amber-700" : "text-ink";
  return (
    <div className={wide ? "w-full max-w-[300px]" : "w-[175px]"} title={label ? `${drive} ${label}` : drive}>
      <div className="flex items-center">
        {name}
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className={`h-full rounded-full ${tone}`} style={{ width: `${(1 - share) * 100}%` }} />
        </div>
      </div>
      <div className="mt-0.5 whitespace-nowrap pl-5 text-[11px] tabular-nums">
        <span className={text}>
          ว่าง {free < 10 ? free.toFixed(1) : Math.round(free)} GB {Math.round(share * 100)}%
        </span>
        <span className="text-faint"> · จาก {Math.round(total)} GB</span>
      </div>
    </div>
  );
}

/** Every drive of the computer, C: on top; computers on an older agent show the system drive only. */
export function DiskBar({ device, wide }: { device: Device; wide?: boolean }) {
  const volumes: VolumeInfo[] = device.volumes.length
    ? device.volumes
    : device.diskFreeGb === null
      ? []
      : [{ drive: "C:", label: "", freeGb: device.diskFreeGb, totalGb: device.diskTotalGb }];
  if (!volumes.length) return <span className="text-faint">–</span>;
  return (
    <div className={`space-y-1.5 ${wide ? "" : "ml-auto w-fit"}`}>
      {volumes.map((v) => (
        <VolumeBar key={v.drive} volume={v} wide={wide} />
      ))}
    </div>
  );
}
