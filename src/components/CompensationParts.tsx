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

/** A multiplier typed as a whole percentage (150 = ×1.5). */
export function MultiplierInput({
  value,
  label,
  onChange,
}: {
  value: number;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={500}
        step={5}
        aria-label={label}
        className="field w-[4.25rem] !py-0.5 text-center text-[11.5px] font-semibold tabular-nums !text-rose-700"
        value={Math.round(value * 1000) / 10}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0) / 100)}
      />
      <span className="text-[11.5px] font-semibold text-rose-700">%</span>
    </span>
  );
}

/** Whole baht, shown with thousands separators while typing; empty = null. */
export function MoneyInput({
  value,
  label,
  onChange,
}: {
  value: number | null;
  label: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      placeholder="0"
      className="field w-40 text-right text-[14px] font-semibold tabular-nums"
      value={value === null ? "" : value.toLocaleString("en-US")}
      onChange={(e) => {
        const input = e.target;
        const caret = input.selectionStart ?? input.value.length;
        const digitsBefore = input.value.slice(0, caret).replace(/\D/g, "").length;
        const digits = input.value.replace(/\D/g, "").slice(0, 12);
        onChange(digits ? Number(digits) : null);
        // The commas move as digits are typed: keep the caret after the same digit.
        requestAnimationFrame(() => {
          let seen = 0;
          let at = 0;
          while (at < input.value.length && seen < digitsBefore) {
            if (/\d/.test(input.value[at])) seen++;
            at++;
          }
          input.setSelectionRange(at, at);
        });
      }}
    />
  );
}
