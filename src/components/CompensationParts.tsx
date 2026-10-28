import { COMPA_GROUPS, compaGroup, percent } from "@/lib/compensation";

/** Small pieces shared by the compensation pages. */

export const segment = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-sm transition ${
    active ? "bg-teal-600 font-medium text-white" : "bg-black/5 text-ink hover:bg-black/10"
  }`;

export const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

export function CompaPill({ ratio }: { ratio: number | null }) {
  if (ratio === null) return <span className="text-faint">–</span>;
  return (
    <span className={`chip tabular-nums ${COMPA_GROUPS[compaGroup(ratio)].tone}`}>{percent(ratio)}</span>
  );
}

export function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card border-l-4 border-l-teal-500 px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight text-teal-900">{value}</div>
      {note && <div className="mt-0.5 text-xs text-faint">{note}</div>}
    </div>
  );
}
