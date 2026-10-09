import Link from "next/link";
import { BAND_NAMES } from "@/lib/constants";
import { formatScore } from "@/lib/format";
import { scoreBand, type Band } from "@/lib/scoring";
import type { BandThresholds, Scales } from "@/lib/types";

export interface NineBoxPerson {
  id: string;
  name: string;
  performance: number;
  potential: number;
  /** False while the supervisor has not confirmed the result yet. */
  confirmed: boolean;
}

/** Tint by distance from the bottom-left corner (0) to the top-right (4). */
const CELL_TINTS = ["bg-red-50", "bg-orange-50", "bg-canvas", "bg-sky-50", "bg-emerald-50"];

const BANDS: Band[] = [0, 1, 2];

/** Score range of each level, for the axis captions. */
const rangesOf = ({ medium, high }: BandThresholds) => [
  `< ${medium.toFixed(2)}`,
  `${medium.toFixed(2)} – ${(high - 0.01).toFixed(2)}`,
  `≥ ${high.toFixed(2)}`,
];

interface NineBoxGridProps {
  people: NineBoxPerson[];
  /** Thresholds of both axes and the name of each box. */
  scales: Scales;
}

export default function NineBoxGrid({ people, scales }: NineBoxGridProps) {
  const potentialRanges = rangesOf(scales.potential);
  const performanceRanges = rangesOf(scales.performance);
  return (
    <div className="grid grid-cols-[auto_1fr] gap-3">
      <div className="flex items-center justify-center">
        <span className="rotate-180 text-xs font-medium text-muted [writing-mode:vertical-rl]">
          Potential (หมวด F) →
        </span>
      </div>

      <div>
        <div className="grid grid-cols-[76px_repeat(3,minmax(0,1fr))] gap-2">
          {[...BANDS].reverse().map((potentialBand) => (
            <div key={potentialBand} className="contents">
              <div className="flex flex-col items-end justify-center pr-1 text-right text-xs">
                <span className="font-medium">{BAND_NAMES[potentialBand]}</span>
                <span className="text-[11px] text-faint">{potentialRanges[potentialBand]}</span>
              </div>
              {BANDS.map((performanceBand) => {
                const inCell = people.filter(
                  (p) =>
                    scoreBand(p.performance, scales.performance) === performanceBand &&
                    scoreBand(p.potential, scales.potential) === potentialBand,
                );
                return (
                  <div
                    key={performanceBand}
                    className={`min-h-[116px] rounded-2xl p-3 ${CELL_TINTS[performanceBand + potentialBand]}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold">
                        {scales.nineBox[potentialBand][performanceBand]}
                      </span>
                      <span className="text-[11px] tabular-nums text-faint">{inCell.length}</span>
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-1">
                      {inCell.map((person) => (
                        <li key={person.id}>
                          <Link
                            href={`/evaluate/${person.id}`}
                            title={`Performance ${formatScore(person.performance)} · Potential ${formatScore(
                              person.potential,
                            )}${person.confirmed ? "" : " · ยังไม่ยืนยันผล"}`}
                            className={`block rounded-full px-2.5 py-0.5 text-[11px] font-medium transition hover:ring-4 hover:ring-accent/20 ${
                              person.confirmed
                                ? "bg-ink text-white"
                                : "border border-dashed border-ink/40 bg-white text-ink"
                            }`}
                          >
                            {person.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ))}

          <div />
          {BANDS.map((band) => (
            <div key={band} className="text-center text-xs">
              <span className="font-medium">{BAND_NAMES[band]}</span>{" "}
              <span className="text-[11px] text-faint">{performanceRanges[band]}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 pl-[76px] text-center text-xs font-medium text-muted">
          Performance Score (หมวด A–E) →
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 pl-[76px] text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded-full bg-ink" /> ยืนยันผลแล้ว
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded-full border border-dashed border-ink/40 bg-white" />
            ผู้ประเมินให้คะแนนแล้ว แต่ยังไม่ยืนยันผล
          </span>
        </div>
      </div>
    </div>
  );
}
