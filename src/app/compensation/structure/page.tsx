"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import IconButton from "@/components/IconButton";
import { api, errorMessage } from "@/lib/api";
import { DEPARTMENTS } from "@/lib/constants";
import type { CompensationAuditEntry, JobLevel, SalaryGrade, SalaryStructure } from "@/lib/types";

interface Notice {
  tone: "ok" | "error";
  text: string;
}

/** A grade while it is being edited: numbers are kept as typed. */
interface GradeDraft {
  grade: string;
  name: string;
  min: string;
  mid: string;
  max: string;
}

/** Keyed by "departmentId:level"; "" = no grade. */
type Mapping = Record<string, string>;

const levelKey = (level: Pick<JobLevel, "departmentId" | "level">) => `${level.departmentId}:${level.level}`;

const toGradeDrafts = (grades: SalaryGrade[]): GradeDraft[] =>
  grades.map((g) => ({
    grade: String(g.grade),
    name: g.name,
    min: String(g.min),
    mid: String(g.mid),
    max: String(g.max),
  }));

const toMapping = (structure: SalaryStructure): Mapping =>
  Object.fromEntries(structure.levelGrades.map((row) => [levelKey(row), String(row.grade)]));

const baht = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 0 });

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

/** (Max − Min) ÷ Min: how wide the band is. */
function spread(grade: GradeDraft): string {
  const min = Number(grade.min);
  const max = Number(grade.max);
  return min > 0 && max >= min ? `${Math.round(((max - min) / min) * 100)}%` : "–";
}

export default function SalaryStructurePage() {
  const confirm = useConfirm();
  const [grades, setGrades] = useState<GradeDraft[] | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [levels, setLevels] = useState<JobLevel[]>([]);
  const [audit, setAudit] = useState<CompensationAuditEntry[]>([]);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .salaryStructure()
      .then((data) => {
        setGrades(toGradeDrafts(data.structure.grades));
        setMapping(toMapping(data.structure));
        setLevels(data.levels);
        setAudit(data.audit);
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
    setGrades([...grades, { grade: String(next), name: "", min: "", mid: "", max: "" }]);
    touched();
  };

  const setLevelGrade = (level: JobLevel, grade: string) => {
    setMapping({ ...mapping, [levelKey(level)]: grade });
    touched();
  };

  // Only grades with a number and a name can be picked for a level.
  const gradeOptions = grades.filter((g) => g.grade.trim() !== "" && g.name.trim() !== "");
  const midOf = (grade: string) => {
    const found = grades.find((g) => g.grade === grade);
    return found && found.mid.trim() !== "" ? Number(found.mid) : null;
  };

  const save = async () => {
    if (grades.some((g) => [g.grade, g.name, g.min, g.mid, g.max].some((v) => v.trim() === ""))) {
      setNotice({ tone: "error", text: "กรุณากรอกข้อมูลกระบอกเงินเดือนให้ครบทุกช่อง" });
      return;
    }
    const known = new Set(grades.map((g) => g.grade));
    const structure: SalaryStructure = {
      grades: grades.map((g) => ({
        grade: Number(g.grade),
        name: g.name.trim(),
        min: Number(g.min),
        mid: Number(g.mid),
        max: Number(g.max),
      })),
      // A level mapped to a grade that was just removed loses its grade.
      levelGrades: levels.flatMap((level) => {
        const grade = mapping[levelKey(level)];
        return grade && known.has(grade)
          ? [{ departmentId: level.departmentId, level: level.level, grade: Number(grade) }]
          : [];
      }),
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
      setMapping(toMapping(saved.structure));
      setAudit(saved.audit);
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
        <header className="px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">กระบอกเงินเดือน</h2>
          <p className="text-xs text-muted">Grade 1 คือกระบอกสูงสุด · จำนวนเงินเป็นบาทต่อเดือน</p>
        </header>
        <div className="overflow-x-auto border-t border-line">
          <table className="sheet min-w-[860px]">
            <thead>
              <tr>
                <th className="w-24 text-center">Job Grade</th>
                <th>ชื่อกระบอก</th>
                <th className="w-36 text-right">Min</th>
                <th className="w-36 text-right">Mid</th>
                <th className="w-36 text-right">Max</th>
                <th className="w-24 text-center">ความกว้าง</th>
                <th className="w-14" aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {grades.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted">
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
                      aria-label={`ชื่อกระบอก แถว ${index + 1}`}
                      value={grade.name}
                      onChange={(e) => editGrade(index, { name: e.target.value })}
                    />
                  </td>
                  {(["min", "mid", "max"] as const).map((field) => (
                    <td key={field}>
                      <input
                        type="number"
                        className="field text-right tabular-nums"
                        min={0}
                        step={500}
                        aria-label={`${field.toUpperCase()} แถว ${index + 1}`}
                        value={grade[field]}
                        onChange={(e) => editGrade(index, { [field]: e.target.value })}
                      />
                    </td>
                  ))}
                  <td className="pt-4 text-center tabular-nums text-muted">{spread(grade)}</td>
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

      <section className="card overflow-hidden">
        <header className="px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">Level ของแต่ละฝ่ายใช้กระบอกไหน</h2>
          <p className="text-xs text-muted">
            Level ที่ยังไม่กำหนดกระบอกจะคำนวณ Compa-ratio ไม่ได้
          </p>
        </header>
        <div className="grid gap-px border-t border-line bg-line md:grid-cols-2">
          {DEPARTMENTS.map((department) => {
            const own = levels.filter((level) => level.departmentId === department.id);
            if (own.length === 0) return null;
            return (
              <div key={department.id} className="bg-white px-5 py-4">
                <h3 className="mb-2 text-sm font-semibold">{department.name}</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {own.map((level) => {
                      const grade = mapping[levelKey(level)] ?? "";
                      const mid = midOf(grade);
                      return (
                        <tr key={level.level} className="border-t border-line first:border-t-0">
                          <td className="py-1.5 pr-3">
                            <div className="font-medium">{level.name}</div>
                            <div className="text-xs text-faint">{level.title}</div>
                          </td>
                          <td className="w-44 py-1.5">
                            <select
                              className="field py-1.5"
                              aria-label={`กระบอกของ ${department.name} ${level.name}`}
                              value={grade}
                              onChange={(e) => setLevelGrade(level, e.target.value)}
                            >
                              <option value="">– ไม่กำหนด</option>
                              {gradeOptions.map((g) => (
                                <option key={g.grade} value={g.grade}>
                                  Grade {g.grade} · {g.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="w-28 py-1.5 text-right tabular-nums text-muted">
                            {mid === null ? "" : `Mid ${baht(mid)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card overflow-hidden">
        <header className="px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">ประวัติการเข้าถึง</h2>
          <p className="text-xs text-muted">ทุกครั้งที่มีคนเปิดดูหรือแก้ข้อมูลค่าตอบแทน · 30 รายการล่าสุด</p>
        </header>
        <ul className="divide-y divide-line border-t border-line text-sm">
          {audit.map((entry, index) => (
            <li key={index} className="flex flex-wrap justify-between gap-2 px-5 py-2">
              <span>
                <span className="font-medium">{entry.actorName}</span> · {entry.action}
              </span>
              <span className="tabular-nums text-muted">{dateTime(entry.at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
