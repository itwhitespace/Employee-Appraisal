"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import IconButton from "@/components/IconButton";
import { api, errorMessage } from "@/lib/api";
import type { JobLevel, SalaryGrade, SalaryStructure } from "@/lib/types";

interface Notice {
  tone: "ok" | "error";
  text: string;
}

/** A grade while it is being edited: numbers are kept as typed. Mid is worked out from them. */
interface GradeDraft {
  grade: string;
  name: string;
  jobLevel: string;
  /** "" = no level. */
  levelName: string;
  min: string;
  max: string;
}

const toGradeDrafts = (grades: SalaryGrade[]): GradeDraft[] =>
  grades.map((g) => ({
    grade: String(g.grade),
    name: g.name,
    jobLevel: g.jobLevel,
    levelName: g.levelName ?? "",
    min: String(g.min),
    max: String(g.max),
  }));

/** Level names in use, lowest first; the same name is one level across departments. */
function levelNames(levels: JobLevel[]): string[] {
  const lowest = new Map<string, number>();
  for (const level of levels) {
    lowest.set(level.name, Math.min(lowest.get(level.name) ?? Infinity, level.level));
  }
  return [...lowest.keys()].sort((a, b) => lowest.get(a)! - lowest.get(b)! || a.localeCompare(b));
}

const baht = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const orDash = (value: number | null) => (value === null ? "–" : baht(value));

/** Midpoint of the band; null until both ends are filled in. */
function midpoint(grade: GradeDraft): number | null {
  if (grade.min.trim() === "" || grade.max.trim() === "") return null;
  return (Number(grade.min) + Number(grade.max)) / 2;
}

/** (Max − Min) ÷ Min: how wide the band is. */
function spread(grade: GradeDraft): string {
  const min = Number(grade.min);
  const max = Number(grade.max);
  return min > 0 && max >= min ? `${Math.round(((max - min) / min) * 100)}%` : "–";
}

export default function SalaryStructurePage() {
  const confirm = useConfirm();
  const [grades, setGrades] = useState<GradeDraft[] | null>(null);
  const [levels, setLevels] = useState<JobLevel[]>([]);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .salaryStructure()
      .then((data) => {
        setGrades(toGradeDrafts(data.structure.grades));
        setLevels(data.levels);
      })
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
  if (!grades) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const touched = () => {
    setDirty(true);
    setNotice(null);
  };

  const editGrade = (index: number, patch: Partial<GradeDraft>) => {
    setGrades(grades.map((g, i) => (i === index ? { ...g, ...patch } : g)));
    touched();
  };

  const removeGrade = (index: number) => {
    setGrades(grades.filter((_, i) => i !== index));
    touched();
  };

  const addGrade = () => {
    const next = Math.max(0, ...grades.map((g) => Number(g.grade) || 0)) + 1;
    setGrades([...grades, { grade: String(next), name: "", jobLevel: "", levelName: "", min: "", max: "" }]);
    touched();
  };

  const names = levelNames(levels);
  const levelCount = (name: string) => levels.filter((level) => level.name === name).length;

  const save = async () => {
    if (grades.some((g) => [g.grade, g.name, g.min, g.max].some((v) => v.trim() === ""))) {
      setNotice({ tone: "error", text: "กรุณากรอกข้อมูลกระบอกเงินเดือนให้ครบทุกช่อง" });
      return;
    }
    const picked = grades.map((g) => g.levelName).filter(Boolean);
    if (new Set(picked).size !== picked.length) {
      setNotice({ tone: "error", text: "Level หนึ่งใช้ได้กับกระบอกเดียว" });
      return;
    }
    const structure: SalaryStructure = {
      grades: grades.map((g) => ({
        grade: Number(g.grade),
        name: g.name.trim(),
        jobLevel: g.jobLevel.trim(),
        levelName: g.levelName || null,
        min: Number(g.min),
        mid: midpoint(g) ?? 0,
        max: Number(g.max),
      })),
    };
    const agreed = await confirm({
      title: "บันทึกโครงสร้างเงินเดือน?",
      message: "Compa-ratio ของพนักงานทุกคนจะคำนวณจากค่า Mid ชุดใหม่",
      confirmLabel: "บันทึก",
    });
    if (!agreed) return;
    setSaving(true);
    try {
      const saved = await api.saveSalaryStructure(structure);
      setGrades(toGradeDrafts(saved.structure.grades));
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
          <h1 className="page-title">โครงสร้างเงินเดือน</h1>
          <p className="mt-1 text-sm text-muted">
            กระบอกเงินเดือน (Min / Mid / Max) ของแต่ละ Job Grade · Compa-ratio = เงินเดือนฐาน ÷ Mid
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
          <button type="button" className="btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>

      <section className="card overflow-hidden">
        <header className="border-l-4 border-teal-500 px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">กระบอกเงินเดือน</h2>
          <p className="text-xs text-muted">
            Grade 1 คือกระบอกสูงสุด · จำนวนเงินเป็นบาทต่อเดือน · ทุกฝ่ายที่อยู่ Level เดียวกันใช้กระบอกเดียวกัน
          </p>
        </header>
        <div className="overflow-x-auto border-t border-line">
          <table className="sheet min-w-[980px]">
            <thead>
              <tr>
                <th className="w-20 text-center">Job Grade</th>
                <th>Title</th>
                <th className="w-20 text-center">Job level</th>
                <th className="w-48">Level ในระบบ</th>
                <th className="w-32 text-right">Max</th>
                <th className="w-32 text-right">Mid</th>
                <th className="w-32 text-right">Min</th>
                <th className="w-24 text-center">ความกว้าง</th>
                <th className="w-14" aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {grades.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted">
                    ยังไม่มีกระบอกเงินเดือน
                  </td>
                </tr>
              )}
              {grades.map((grade, index) => (
                <tr key={index}>
                  <td>
                    <input
                      type="number"
                      className="field text-center tabular-nums"
                      min={1}
                      step={1}
                      aria-label={`Job Grade แถว ${index + 1}`}
                      value={grade.grade}
                      onChange={(e) => editGrade(index, { grade: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="field font-semibold"
                      maxLength={80}
                      aria-label={`Title แถว ${index + 1}`}
                      value={grade.name}
                      onChange={(e) => editGrade(index, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="field text-center font-semibold"
                      maxLength={10}
                      placeholder="เช่น MD"
                      aria-label={`Job level แถว ${index + 1}`}
                      value={grade.jobLevel}
                      onChange={(e) => editGrade(index, { jobLevel: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="field"
                      aria-label={`Level ในระบบ แถว ${index + 1}`}
                      value={grade.levelName}
                      onChange={(e) => editGrade(index, { levelName: e.target.value })}
                    >
                      <option value="">– ไม่มี</option>
                      {names.map((name) => {
                        const taken = grades.some((g, i) => i !== index && g.levelName === name);
                        return (
                          <option key={name} value={name} disabled={taken}>
                            {name} ({levelCount(name)} ฝ่าย){taken ? " · ใช้แล้ว" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      className="field text-right tabular-nums"
                      min={0}
                      step={500}
                      aria-label={`MAX แถว ${index + 1}`}
                      value={grade.max}
                      onChange={(e) => editGrade(index, { max: e.target.value })}
                    />
                  </td>
                  {/* Mid is always halfway between Min and Max. */}
                  <td className="bg-teal-50/60 text-right font-semibold tabular-nums text-teal-700">
                    {orDash(midpoint(grade))}
                  </td>
                  <td>
                    <input
                      type="number"
                      className="field text-right tabular-nums"
                      min={0}
                      step={500}
                      aria-label={`MIN แถว ${index + 1}`}
                      value={grade.min}
                      onChange={(e) => editGrade(index, { min: e.target.value })}
                    />
                  </td>
                  <td className="text-center tabular-nums text-muted">{spread(grade)}</td>
                  <td className="!px-1.5 !py-1.5 text-right">
                    <IconButton icon="delete" label="ลบ" tone="danger" onClick={() => removeGrade(index)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line bg-canvas/70 px-5 py-3">
          <button type="button" className="btn-secondary" onClick={addGrade}>
            + เพิ่มกระบอก
          </button>
        </div>
      </section>

    </div>
  );
}
