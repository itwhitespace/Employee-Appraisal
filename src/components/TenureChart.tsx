import { BAND_NAMES } from "@/lib/constants";
import { findLevel } from "@/lib/evaluation";
import { displayName, formatScore } from "@/lib/format";
import type { OverviewRow } from "@/lib/overview";
import { scoreBand } from "@/lib/scoring";
import type { JobLevel, Scales } from "@/lib/types";

/**
 * Tenure against performance: x = years with the company ÷ the years expected by the end of
 * the person's level (Career Matrix), y = the supervisor's Performance Score. The lines at
 * x = 1 and at the "High" performance threshold split it into four groups.
 */

interface TenureChartProps {
  rows: OverviewRow[];
  levels: JobLevel[];
  scales: Scales;
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

const W = 1000;
const H = 560;
const PAD = { left: 64, right: 24, top: 24, bottom: 56 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const Y_MIN = 1;
const Y_MAX = 5;

/** Potential level → dot colour; Low / Medium / High differ in lightness, not hue alone. */
const POTENTIAL_COLORS = ["#c2410c", "#0062c4", "#0b5d36"];

const QUADRANTS = [
  { right: false, top: true, title: "RISING STAR", text: "เร่งพัฒนา ให้งานท้าทาย วางแผนรักษาไว้", fill: "#eef5fd" },
  { right: true, top: true, title: "PROMOTION OVERDUE", text: "เลื่อนตำแหน่งทันที เสี่ยงลาออกสูงสุด", fill: "#fff4e5" },
  { right: false, top: false, title: "DEVELOPING", text: "coaching ใกล้ชิด ตรวจว่าเลือกคนถูกไหม", fill: "#f6f6f3" },
  { right: true, top: false, title: "STAGNANT / MISFIT", text: "ทบทวนว่าตำแหน่งเหมาะไหม ย้ายบทบาท หรือ PIP", fill: "#fdeceb" },
];

interface Point {
  row: OverviewRow;
  years: number;
  expected: number;
  ratio: number;
  performance: number;
  potential: number | null;
}

interface Skipped {
  row: OverviewRow;
  reason: string;
}

function place(rows: OverviewRow[], levels: JobLevel[]): { points: Point[]; skipped: Skipped[] } {
  const points: Point[] = [];
  const skipped: Skipped[] = [];
  const now = Date.now();
  for (const row of rows) {
    const { employee } = row;
    const expected = findLevel(levels, employee.departmentId, employee.level)?.expectedYears ?? null;
    const started = employee.startDate ? Date.parse(employee.startDate) : NaN;
    if (row.performance === null) skipped.push({ row, reason: "ผู้ประเมินยังให้คะแนนไม่ครบ" });
    else if (!expected) skipped.push({ row, reason: "ระดับนี้ไม่ได้กำหนดปีที่คาดหวัง" });
    else if (Number.isNaN(started)) skipped.push({ row, reason: "ยังไม่มีวันเริ่มงาน" });
    else {
      const years = Math.max(0, (now - started) / YEAR_MS);
      points.push({
        row,
        years,
        expected,
        ratio: years / expected,
        performance: row.performance,
        potential: row.potential,
      });
    }
  }
  return { points, skipped };
}

export default function TenureChart({ rows, levels, scales }: TenureChartProps) {
  const { points, skipped } = place(rows, levels);
  const cut = scales.performance.high;
  // At least 0–2, widened in half steps for anyone further out, up to 3 (later ones sit on the edge).
  const xMax = Math.min(3, Math.max(2, Math.ceil(Math.max(0, ...points.map((p) => p.ratio)) * 2) / 2));
  const x = (value: number) => PAD.left + (Math.min(value, xMax) / xMax) * PLOT_W;
  const y = (value: number) =>
    PAD.top + (1 - (Math.min(Math.max(value, Y_MIN), Y_MAX) - Y_MIN) / (Y_MAX - Y_MIN)) * PLOT_H;
  const xTicks = Array.from({ length: xMax * 2 + 1 }, (_, i) => i / 2);
  const yTicks = [1, 2, 3, 4, 5];

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="กราฟอายุงานเทียบผลงาน">
        {QUADRANTS.map((q) => {
          const left = q.right ? x(1) : PAD.left;
          const right = q.right ? PAD.left + PLOT_W : x(1);
          const top = q.top ? PAD.top : y(cut);
          const bottom = q.top ? y(cut) : PAD.top + PLOT_H;
          const tx = q.right ? right - 12 : left + 12;
          const anchor = q.right ? "end" : "start";
          return (
            <g key={q.title}>
              <rect x={left} y={top} width={right - left} height={bottom - top} fill={q.fill} />
              <text x={tx} y={top + 24} textAnchor={anchor} fontSize="15" fontWeight="700" fill="#1d1f1d">
                {q.title}
              </text>
              <text x={tx} y={top + 44} textAnchor={anchor} fontSize="13" fill="#4a4e49">
                {q.text}
              </text>
            </g>
          );
        })}

        {yTicks.map((tick) => (
          <g key={`y${tick}`}>
            <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={y(tick)} y2={y(tick)} stroke="#e5e5ea" />
            <text x={PAD.left - 10} y={y(tick) + 4} textAnchor="end" fontSize="13" fill="#6e6e73">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text key={`x${tick}`} x={x(tick)} y={PAD.top + PLOT_H + 22} textAnchor="middle" fontSize="13" fill="#6e6e73">
            {tick === xMax && xMax === 3 ? "≥ 3.0" : tick.toFixed(1)}
          </text>
        ))}

        <line x1={x(1)} x2={x(1)} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#1d1f1d" strokeDasharray="6 5" />
        <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={y(cut)} y2={y(cut)} stroke="#1d1f1d" strokeDasharray="6 5" />
        <text x={PAD.left + PLOT_W - 4} y={y(cut) - 6} textAnchor="end" fontSize="12" fill="#1d1f1d">
          {formatScore(cut)}
        </text>

        <text x={PAD.left + PLOT_W / 2} y={H - 8} textAnchor="middle" fontSize="14" fill="#1d1f1d">
          อายุงาน ÷ ปีที่คาดหวังของระดับ (1.0 = ครบเกณฑ์ระดับ)
        </text>
        <text
          transform={`translate(18 ${PAD.top + PLOT_H / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="14"
          fill="#1d1f1d"
        >
          Performance Score
        </text>

        {points.map((point) => {
          const { employee } = point.row;
          const band = point.potential === null ? null : scoreBand(point.potential, scales.potential);
          const color = band === null ? "#86868b" : POTENTIAL_COLORS[band];
          const confirmed = point.row.status === "completed";
          return (
            <a key={employee.id} href={`/evaluate/${employee.id}`}>
              <title>
                {`${displayName(employee)} · ${point.row.levelName ?? ""}\n` +
                  `อายุงาน ${point.years.toFixed(1)} ปี จากที่คาดหวัง ${point.expected} ปี (${point.ratio.toFixed(2)})\n` +
                  `Performance ${formatScore(point.performance)} · Potential ${
                    band === null ? "–" : `${formatScore(point.potential)} ${BAND_NAMES[band]}`
                  }${confirmed ? "" : "\nยังไม่ยืนยันผล"}`}
              </title>
              <circle
                cx={x(point.ratio)}
                cy={y(point.performance)}
                r="9"
                fill={confirmed ? color : "#ffffff"}
                stroke={color}
                strokeWidth={confirmed ? 1.5 : 2.5}
                strokeDasharray={confirmed ? undefined : "3 2"}
                fillOpacity={confirmed ? 0.85 : 1}
              />
            </a>
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="font-medium text-ink">สีจุด = Potential</span>
        {BAND_NAMES.map((name, band) => (
          <span key={name} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: POTENTIAL_COLORS[band] }} />
            {name}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-faint bg-white" />
          ยังไม่ยืนยันผล
        </span>
        <span>วางเมาส์บนจุดเพื่อดูรายละเอียด คลิกเพื่อเปิดแบบประเมิน</span>
      </div>

      {skipped.length > 0 && (
        <details className="rounded-xl bg-canvas/70 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">
            ไม่อยู่บนกราฟ {skipped.length} คน
          </summary>
          <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {skipped.map(({ row, reason }) => (
              <li key={row.employee.id}>
                {displayName(row.employee)} <span className="text-muted">— {reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
