const TINTS: Record<number, string> = {
  1: "bg-red-50 text-red-700",
  2: "bg-orange-50 text-orange-700",
  3: "bg-yellow-50 text-yellow-800",
  4: "bg-lime-50 text-lime-800",
  5: "bg-emerald-50 text-emerald-700",
};

interface ScoreSelectProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  /** Highlight an empty cell after a failed submit. */
  flagMissing?: boolean;
}

export default function ScoreSelect({ label, value, onChange, disabled, flagMissing }: ScoreSelectProps) {
  const missing = flagMissing && value === null;
  return (
    <select
      aria-label={label}
      aria-invalid={missing || undefined}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={`w-full rounded-lg border px-1 py-1.5 text-center text-[13px] font-semibold tabular-nums outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed ${
        value !== null
          ? TINTS[value]
          : disabled
            ? "bg-transparent text-faint"
            : "bg-amber-50 text-faint hover:bg-amber-100"
      } ${
        missing
          ? "border-red-400 ring-4 ring-red-100"
          : disabled
            ? "border-transparent"
            : "border-amber-300"
      }`}
    >
      <option value="">–</option>
      {[1, 2, 3, 4, 5].map((score) => (
        <option key={score} value={score}>
          {score}
        </option>
      ))}
    </select>
  );
}
