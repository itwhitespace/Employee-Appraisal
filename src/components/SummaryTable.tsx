import { BAND_NAMES, SECTION_CONFIG, WEIGHTED_SECTIONS } from "@/lib/constants";
import { formatScore } from "@/lib/format";
import { nineBoxPosition, ratingBandOf, scoreBand, type ScoreSummary } from "@/lib/scoring";
import type { Scales, Weights } from "@/lib/types";

interface SummaryTableProps {
  summary: ScoreSummary;
  weights: Weights;
  /** The scales the grade, the levels and the 9-Box position are read from. */
  scales: Scales;
  /** True while the supervisor's result is not yet released to the employee. */
  supervisorHidden: boolean;
}

const weighted = (average: number | null, weight: number) =>
  average === null ? null : average * (weight / 100);

export default function SummaryTable({
  summary,
  weights,
  scales,
  supervisorHidden,
}: SummaryTableProps) {
  const { performance, potential, sections } = summary;
  const position = nineBoxPosition(performance.supervisor, potential.supervisor, scales);
  const band = ratingBandOf(performance.supervisor, scales.ratingBands);
  const pending = supervisorHidden ? "รอผลจากผู้ประเมิน" : "ยังไม่ครบ";

  const results = [
    {
      label: "Potential (ค่าเฉลี่ยหมวด F)",
      value:
        potential.supervisor === null
          ? null
          : `${formatScore(potential.supervisor)} / ${
              BAND_NAMES[scoreBand(potential.supervisor, scales.potential)]
            }`,
    },
    {
      label: "Performance Band",
      value:
        performance.supervisor === null
          ? null
          : BAND_NAMES[scoreBand(performance.supervisor, scales.performance)],
    },
    { label: "9-Box Position", value: position?.label ?? null },
    { label: "ความพร้อมเลื่อนระดับ (เบื้องต้น)", value: band?.meaning || null },
  ];

  return (
    <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="overflow-x-auto">
        <table className="sheet min-w-[520px] tabular-nums">
          <thead>
            <tr>
              <th>หมวด</th>
              <th className="w-20 text-center">น้ำหนัก</th>
              <th className="w-20 text-center">Self</th>
              <th className="w-24 text-center">Supervisor</th>
              <th className="w-28 text-center">ถ่วงน้ำหนัก</th>
            </tr>
          </thead>
          <tbody>
            {WEIGHTED_SECTIONS.map((key) => (
              <tr key={key}>
                <td>
                  <span className="font-semibold">{key}.</span> {SECTION_CONFIG[key].title}
                </td>
                <td className="text-center text-muted">{weights[key]}%</td>
                <td className="text-center">{formatScore(sections[key].self)}</td>
                <td className="text-center">{formatScore(sections[key].supervisor)}</td>
                <td className="text-center font-semibold">
                  {formatScore(weighted(sections[key].supervisor, weights[key]))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>คะแนนรวม (Performance Score, เต็ม 5.00)</td>
              <td className="text-center">{formatScore(performance.self)}</td>
              <td colSpan={2} className="text-center text-accent">
                {performance.supervisor === null ? pending : formatScore(performance.supervisor)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="border-t border-line p-5 lg:border-l lg:border-t-0">
        <div className="text-xs font-medium text-muted">Performance Score · คะแนน Supervisor เป็นตัวตัดสิน</div>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-semibold tracking-tight tabular-nums">
              {formatScore(performance.supervisor)}
            </span>
            <span className="text-sm text-faint">/ 5.00</span>
          </div>
          {band && (
            <span className="text-right text-xl font-semibold tracking-tight text-accent">
              {band.grade}
            </span>
          )}
        </div>
        <dl className="mt-4 divide-y divide-line text-sm">
          {results.map((item) => (
            <div key={item.label} className="flex items-baseline justify-between gap-4 py-2">
              <dt className="text-muted">{item.label}</dt>
              <dd className={`text-right font-medium ${item.value ? "" : "text-faint"}`}>
                {item.value ?? pending}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
