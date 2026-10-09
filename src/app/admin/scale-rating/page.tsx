"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { api, errorMessage } from "@/lib/api";
import { BAND_NAMES } from "@/lib/constants";
import type { BandThresholds, RatingBand, Scales } from "@/lib/types";

interface Notice {
  tone: "ok" | "error";
  text: string;
}

/** The scales while they are being edited: scores are kept as typed. */
interface Draft {
  ratingBands: (Omit<RatingBand, "min"> & { min: string })[];
  potential: { medium: string; high: string };
  performance: { medium: string; high: string };
  nineBox: string[][];
}

type Axis = "potential" | "performance";

const typed = (thresholds: BandThresholds) => ({
  medium: thresholds.medium.toFixed(2),
  high: thresholds.high.toFixed(2),
});

const toDraft = (scales: Scales): Draft => ({
  ratingBands: scales.ratingBands.map((band) => ({ ...band, min: band.min.toFixed(2) })),
  potential: typed(scales.potential),
  performance: typed(scales.performance),
  nineBox: scales.nineBox.map((row) => [...row]),
});

const toScales = (draft: Draft): Scales => ({
  ratingBands: draft.ratingBands.map((band) => ({ ...band, min: Number(band.min) })),
  potential: { medium: Number(draft.potential.medium), high: Number(draft.potential.high) },
  performance: { medium: Number(draft.performance.medium), high: Number(draft.performance.high) },
  nineBox: draft.nineBox,
});

const AXES: { axis: Axis; title: string; column: string }[] = [
  { axis: "potential", title: "Potential (ค่าเฉลี่ยหมวด F)", column: "Potential" },
  { axis: "performance", title: "Performance Band", column: "Performance" },
];

export default function ScaleRatingPage() {
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .scales()
      .then(({ scales }) => setDraft(toDraft(scales)))
      .catch((e) => setLoadError(errorMessage(e)));
  }, []);

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (loadError) return <div className="card p-8 text-center text-red-500">{loadError}</div>;
  if (!draft) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const edit = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setDirty(true);
    setNotice(null);
  };

  const editBand = (index: number, patch: Partial<Draft["ratingBands"][number]>) =>
    edit({
      ratingBands: draft.ratingBands.map((band, i) => (i === index ? { ...band, ...patch } : band)),
    });

  const editBox = (potential: number, performance: number, label: string) =>
    edit({
      nineBox: draft.nineBox.map((row, i) =>
        i === potential ? row.map((cell, j) => (j === performance ? label : cell)) : row,
      ),
    });

  const save = async () => {
    const scores = [
      ...draft.ratingBands.map((band) => band.min),
      ...AXES.flatMap(({ axis }) => [draft[axis].medium, draft[axis].high]),
    ];
    if (scores.some((score) => score.trim() === "")) {
      setNotice({ tone: "error", text: "กรุณากรอกคะแนนขั้นต่ำให้ครบทุกช่อง" });
      return;
    }
    const agreed = await confirm({
      title: "บันทึกเกณฑ์ทั้งหมด?",
      message: "เกรดและ 9-Box ของรอบปัจจุบันจะคำนวณตามเกณฑ์ใหม่ทันที",
      confirmLabel: "บันทึก",
    });
    if (!agreed) return;
    setSaving(true);
    try {
      setDraft(toDraft((await api.saveScales(toScales(draft))).scales));
      setDirty(false);
      setNotice({ tone: "ok", text: "บันทึกแล้ว" });
    } catch (e) {
      setNotice({ tone: "error", text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[1180px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Scale &amp; Rating</h1>
          <p className="mt-1 text-sm text-muted">
            เกณฑ์ที่ใช้แปลงคะแนนเป็นเกรด ระดับ Potential / Performance และตำแหน่งใน 9-Box
          </p>
        </div>
        <div className="flex items-center gap-3">
          {notice && (
            <span
              role="status"
              className={`chip py-1 ${
                notice.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
              }`}
            >
              {notice.text}
            </span>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>

      <section className="card overflow-hidden">
        <header className="px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">Rating Band ของคะแนนรวม</h2>
          <p className="text-xs text-muted">
            เกรดได้จากการเทียบคะแนนรวม (Performance Score) กับคะแนนขั้นต่ำ
          </p>
        </header>
        <div className="overflow-x-auto border-t border-line">
          <table className="sheet min-w-[900px]">
            <thead>
              <tr>
                <th className="w-28">คะแนนขั้นต่ำ</th>
                <th className="w-60">Grade</th>
                <th>ความหมาย / การดำเนินการ</th>
                <th className="w-32">สัดส่วนที่แนะนำ</th>
                <th className="w-36">ตัวคูณ Merit (เสนอ)</th>
              </tr>
            </thead>
            <tbody>
              {draft.ratingBands.map((band, index) => (
                <tr key={index}>
                  <td>
                    <input
                      type="number"
                      className="field tabular-nums"
                      min={0}
                      max={5}
                      step={0.01}
                      aria-label={`คะแนนขั้นต่ำ แถว ${index + 1}`}
                      value={band.min}
                      onChange={(e) => editBand(index, { min: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="field font-semibold"
                      maxLength={60}
                      aria-label={`Grade แถว ${index + 1}`}
                      value={band.grade}
                      onChange={(e) => editBand(index, { grade: e.target.value })}
                    />
                  </td>
                  <td>
                    <textarea
                      className="field resize-y"
                      rows={2}
                      maxLength={300}
                      aria-label={`ความหมาย แถว ${index + 1}`}
                      value={band.meaning}
                      onChange={(e) => editBand(index, { meaning: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="field tabular-nums"
                      maxLength={30}
                      aria-label={`สัดส่วนที่แนะนำ แถว ${index + 1}`}
                      value={band.share}
                      onChange={(e) => editBand(index, { share: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="field tabular-nums"
                      maxLength={30}
                      aria-label={`ตัวคูณ Merit แถว ${index + 1}`}
                      value={band.merit}
                      onChange={(e) => editBand(index, { merit: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden">
        <header className="px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">9-Box Talent</h2>
          <p className="text-xs text-muted">
            ชื่อช่องของแต่ละคู่ระดับ Potential (แกน Y) และ Performance (แกน X)
          </p>
        </header>
        <div className="overflow-x-auto border-t border-line">
          <table className="sheet min-w-[720px]">
            <thead>
              <tr>
                <th className="w-14 text-center">id</th>
                <th className="w-52">potential_level (แกน Y)</th>
                <th className="w-52">performance_level (แกน X)</th>
                <th>box_label</th>
              </tr>
            </thead>
            <tbody>
              {BAND_NAMES.flatMap((potentialLevel, i) =>
                BAND_NAMES.map((performanceLevel, j) => (
                  <tr key={`${i}-${j}`}>
                    <td className="pt-4 text-center tabular-nums text-faint">{i * 3 + j + 1}</td>
                    <td className="pt-4 font-semibold">{potentialLevel}</td>
                    <td className="pt-4 font-semibold">{performanceLevel}</td>
                    <td>
                      <input
                        className="field"
                        maxLength={80}
                        aria-label={`ชื่อช่อง Potential ${potentialLevel} Performance ${performanceLevel}`}
                        value={draft.nineBox[i][j]}
                        onChange={(e) => editBox(i, j, e.target.value)}
                      />
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {AXES.map(({ axis, title, column }) => (
          <section key={axis} className="card overflow-hidden">
            <header className="px-5 py-4">
              <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
            </header>
            <div className="border-t border-line">
              <table className="sheet">
                <thead>
                  <tr>
                    <th className="w-40">คะแนนขั้นต่ำ</th>
                    <th>{column}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="tabular-nums text-muted">0.00</td>
                    <td className="font-semibold">Low</td>
                  </tr>
                  {(["medium", "high"] as const).map((level) => (
                    <tr key={level}>
                      <td>
                        <input
                          type="number"
                          className="field tabular-nums"
                          min={0}
                          max={5}
                          step={0.01}
                          aria-label={`คะแนนขั้นต่ำของ ${column} ${level}`}
                          value={draft[axis][level]}
                          onChange={(e) => edit({ [axis]: { ...draft[axis], [level]: e.target.value } })}
                        />
                      </td>
                      <td className="pt-4 font-semibold">{level === "medium" ? "Medium" : "High"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
