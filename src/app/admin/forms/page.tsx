"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import QuestionEditor from "@/components/QuestionEditor";
import { ALL_SECTIONS, DEPARTMENTS, SECTION_CONFIG, WEIGHTED_SECTIONS } from "@/lib/constants";
import { api, errorMessage } from "@/lib/api";
import { findLevel, findTemplate, validateTemplate } from "@/lib/evaluation";
import { formatDateTime } from "@/lib/format";
import type {
  DepartmentId,
  FormTemplate,
  JobLevel,
  Level,
  Question,
  SectionKey,
  WeightedSectionKey,
} from "@/lib/types";

interface Notice {
  tone: "ok" | "error";
  text: string;
}

const segment = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-sm transition ${
    active ? "bg-ink font-medium text-white" : "bg-black/5 text-ink hover:bg-black/10"
  }`;

export default function FormBuilderPage() {
  const confirm = useConfirm();
  const [levels, setLevels] = useState<JobLevel[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[] | null>(null);
  const [draft, setDraft] = useState<FormTemplate | null>(null);
  const [section, setSection] = useState<SectionKey>("A");
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .templates()
      .then(({ levels: loadedLevels, templates: loaded }) => {
        setLevels(loadedLevels);
        setTemplates(loaded);
        setDraft(loaded[0] ?? null);
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
  if (!templates) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;
  if (!draft) {
    return (
      <div className="card p-8 text-center text-muted">
        ยังไม่มี Level ในระบบ กรุณาเพิ่มที่หน้า{" "}
        <Link href="/admin/levels" className="text-accent">
          ฝ่ายและ Level
        </Link>{" "}
        ก่อน
      </div>
    );
  }

  const levelsOf = (departmentId: DepartmentId) =>
    levels.filter((l) => l.departmentId === departmentId);

  const select = async (departmentId: DepartmentId, level: Level) => {
    if (departmentId === draft.departmentId && level === draft.level) return;
    if (
      dirty &&
      !(await confirm({
        title: "ทิ้งการแก้ไขที่ยังไม่ได้บันทึก?",
        message: "การแก้ไขในแบบประเมินนี้จะหายไป",
        confirmLabel: "ทิ้งการแก้ไข",
        tone: "danger",
      }))
    ) {
      return;
    }
    setDraft(findTemplate(templates, departmentId, level));
    setDirty(false);
    setNotice(null);
  };

  const edit = (patch: Partial<FormTemplate>) => {
    setDraft({ ...draft, ...patch });
    setDirty(true);
    setNotice(null);
  };

  const setWeight = (key: WeightedSectionKey, value: string) => {
    const parsed = Number(value);
    const weight = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
    edit({ weights: { ...draft.weights, [key]: weight } });
  };

  const setQuestions = (key: SectionKey, questions: Question[]) =>
    edit({ sections: { ...draft.sections, [key]: questions } });

  const save = async () => {
    const problem = validateTemplate(draft);
    if (problem) {
      setNotice({ tone: "error", text: problem });
      return;
    }
    const agreed = await confirm({
      title: "บันทึก Form Template?",
      message: "แบบประเมินของพนักงานในฝ่ายและ Level นี้จะเปลี่ยนตามทันที",
      confirmLabel: "บันทึก",
    });
    if (!agreed) return;
    setSaving(true);
    try {
      const { template: saved } = await api.saveTemplate(draft);
      setTemplates(
        templates.map((t) =>
          t.departmentId === saved.departmentId && t.level === saved.level ? saved : t,
        ),
      );
      setDraft(saved);
      setDirty(false);
      setNotice({ tone: "ok", text: "บันทึก Form Template แล้ว" });
    } catch (e) {
      setNotice({ tone: "error", text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const weightTotal = WEIGHTED_SECTIONS.reduce((sum, key) => sum + draft.weights[key], 0);
  const departmentName = DEPARTMENTS.find((d) => d.id === draft.departmentId)?.name;
  const levelName = findLevel(levels, draft.departmentId, draft.level)?.name;
  const config = SECTION_CONFIG[section];

  return (
    <div className="space-y-6 pb-28">
      <div>
        <h1 className="page-title">Form Builder</h1>
        <p className="mt-1 text-sm text-muted">
          เพิ่ม ลบ แก้ไขข้อประเมินของทุกหมวด แยกตามฝ่ายและ Level
        </p>
      </div>

      {/* Department x Level picker */}
      <section className="card space-y-4 p-5">
        <div>
          <div className="mb-2 text-xs font-medium text-muted">ฝ่าย (Department)</div>
          <div className="flex flex-wrap gap-2">
            {DEPARTMENTS.map((department) => (
              <button
                key={department.id}
                type="button"
                aria-pressed={draft.departmentId === department.id}
                disabled={levelsOf(department.id).length === 0}
                onClick={() => {
                  // Stay on the same level number when the other department has it.
                  const options = levelsOf(department.id);
                  const target = options.find((l) => l.level === draft.level) ?? options[0];
                  void select(department.id, target.level);
                }}
                className={`${segment(draft.departmentId === department.id)} disabled:opacity-40`}
              >
                {department.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium text-muted">Level</div>
          <div className="flex flex-wrap gap-2">
            {levelsOf(draft.departmentId).map((level) => (
              <button
                key={level.level}
                type="button"
                aria-pressed={draft.level === level.level}
                onClick={() => void select(draft.departmentId, level.level)}
                className={segment(draft.level === level.level)}
              >
                {level.name} · {level.title}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">
          บันทึกล่าสุด {draft.updatedAt ? formatDateTime(draft.updatedAt) : "ยังใช้ค่าเริ่มต้น"}
        </p>
      </section>

      {/* Weights */}
      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight">น้ำหนักของแต่ละหมวด</h2>
            <p className="text-xs text-muted">
              Performance Score ={" "}
              {WEIGHTED_SECTIONS.map((key) => `${key}×${(draft.weights[key] / 100).toFixed(2)}`).join(" + ")}
            </p>
          </div>
          <span
            className={`chip ${
              weightTotal === 100 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
            }`}
          >
            รวม {weightTotal}%{weightTotal === 100 ? "" : " · ต้องเท่ากับ 100%"}
          </span>
        </header>
        <div className="grid grid-cols-2 gap-3 border-t border-line p-5 sm:grid-cols-3 lg:grid-cols-5">
          {WEIGHTED_SECTIONS.map((key) => (
            <label key={key} className="block">
              <span className="mb-1.5 block text-xs text-muted">
                <span className="font-semibold text-ink">{key}.</span> {SECTION_CONFIG[key].title}
              </span>
              <span className="relative block">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  className="field pr-8 text-base font-semibold tabular-nums"
                  value={draft.weights[key]}
                  onChange={(e) => setWeight(key, e.target.value)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-faint">
                  %
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Questions, one section at a time */}
      <section className="card overflow-hidden">
        <header className="px-5 pt-4">
          <h2 className="text-[17px] font-semibold tracking-tight">ข้อประเมิน</h2>
          <div className="mt-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="หมวดการประเมิน">
            {ALL_SECTIONS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={section === key}
                onClick={() => setSection(key)}
                className={`shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-sm transition ${
                  section === key
                    ? "border-accent font-medium text-accent"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {key}. {SECTION_CONFIG[key].title}
              </button>
            ))}
          </div>
        </header>
        <div className="border-t border-line">
          <p className="px-5 py-3 text-xs text-muted">
            {config.subtitle}
            {config.entryLabel && <> · ช่อง “{config.entryLabel}” จะให้กรอกในแบบประเมิน</>}
          </p>
          <div className="border-t border-line">
            <QuestionEditor
              section={section}
              questions={draft.sections[section]}
              onChange={(questions) => setQuestions(section, questions)}
            />
          </div>
        </div>
      </section>

      {/* Fixed save bar */}
      <div className="action-bar">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">
              {departmentName} · {levelName}
            </span>
            {dirty && <span className="chip bg-orange-50 text-orange-700">ยังไม่ได้บันทึก</span>}
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
          </div>
          <button type="button" className="btn-primary" onClick={save} disabled={!dirty || saving}>
            {saving ? "กำลังบันทึก…" : "Save Form Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
