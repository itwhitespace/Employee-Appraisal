import { formatCycle } from "@/lib/format";
import type { Cycle } from "@/lib/types";

interface CycleSelectProps {
  cycles: Cycle[];
  /** Id of the cycle being shown. */
  value: string;
  onChange: (cycle: Cycle) => void;
}

/** Picks the appraisal cycle to look at; hidden while there is only one. */
export default function CycleSelect({ cycles, value, onChange }: CycleSelectProps) {
  if (cycles.length < 2) return null;
  return (
    <select
      className="field w-auto max-w-full bg-white shadow-card"
      aria-label="เลือกรอบประเมิน"
      value={value}
      onChange={(e) => {
        const cycle = cycles.find((c) => c.id === e.target.value);
        if (cycle) onChange(cycle);
      }}
    >
      {cycles.map((cycle) => (
        <option key={cycle.id} value={cycle.id}>
          {formatCycle(cycle)}
          {cycle.current ? " · ปัจจุบัน" : ""}
        </option>
      ))}
    </select>
  );
}
