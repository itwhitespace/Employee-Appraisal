/** "FY2026/27 (ต.ค. 2026 – ก.ย. 2027)" */
export function formatCycle(cycle: { id: string; period: string }): string {
  return cycle.period ? `${cycle.id} (${cycle.period})` : cycle.id;
}

export function formatScore(value: number | null): string {
  return value === null ? "–" : value.toFixed(2);
}

export function gapOf(self: number | null, supervisor: number | null): number | null {
  if (self === null || supervisor === null) return null;
  return supervisor - self;
}

export function formatGap(gap: number | null, digits = 2): string {
  if (gap === null) return "–";
  const text = gap.toFixed(digits);
  return gap > 0 ? `+${text}` : text;
}

export function gapClass(gap: number | null): string {
  if (gap === null || Math.abs(gap) < 0.005) return "text-faint";
  return gap > 0 ? "text-emerald-600" : "text-red-500";
}

export function formatDate(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium" });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export function yearsSince(iso: string | null): string | null {
  if (!iso) return null;
  const years = (Date.now() - new Date(iso).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return Math.max(0, years).toFixed(1);
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
