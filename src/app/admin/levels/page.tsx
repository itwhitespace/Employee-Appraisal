"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import IconButton from "@/components/IconButton";
import { api, errorMessage } from "@/lib/api";
import { DEPARTMENTS } from "@/lib/constants";
import { useOverview } from "@/lib/overview";
import type { DepartmentId, JobLevel } from "@/lib/types";

const segment = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-sm transition ${
    active ? "bg-ink font-medium text-white" : "bg-black/5 text-ink hover:bg-black/10"
  }`;

interface LevelRowProps {
  level: JobLevel;
  /** Employees currently on this level; it cannot be deleted while there are any. */
  headcount: number;
  onSave: (level: JobLevel) => Promise<void>;
  onDelete: (level: JobLevel) => Promise<void>;
}

function LevelRow({ level, headcount, onSave, onDelete }: LevelRowProps) {
  const [name, setName] = useState(level.name);
  const [title, setTitle] = useState(level.title);
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== level.name || title.trim() !== level.title;

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    await task();
    setBusy(false);
  };

  return (
    <tr>
      <td className="pt-4 text-center tabular-nums text-faint">{level.level}</td>
      <td>
        <input
          className="field font-semibold"
          aria-label={`ชื่อระดับ ลำดับ ${level.level}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </td>
      <td>
        <input
          className="field"
          aria-label={`ชื่อตำแหน่ง ลำดับ ${level.level}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </td>
      <td className="pt-4 text-center tabular-nums text-muted">{headcount || "–"}</td>
      <td className="whitespace-nowrap !px-1.5 !py-1.5 text-right">
        <IconButton
          icon="save"
          label="บันทึก"
          disabled={!dirty || busy || !name.trim()}
          onClick={() => run(() => onSave({ ...level, name: name.trim(), title: title.trim() }))}
        />
        <IconButton
          icon="delete"
          label={headcount > 0 ? "ยังมีพนักงานอยู่ใน Level นี้" : "ลบ"}
          tone="danger"
          disabled={busy || headcount > 0}
          onClick={() => run(() => onDelete(level))}
        />
      </td>
    </tr>
  );
}

export default function LevelsPage() {
  const confirm = useConfirm();
  const { data, error, reload } = useOverview();
  const [departmentId, setDepartmentId] = useState<DepartmentId>(DEPARTMENTS[0].id);
  const [newName, setNewName] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (error) return <div className="card p-8 text-center text-red-500">{error}</div>;
  if (!data) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const levels = data.levels.filter((l) => l.departmentId === departmentId);
  const nextLevel = Math.max(0, ...levels.map((l) => l.level)) + 1;
  const headcount = (level: JobLevel) =>
    data.users.filter((u) => u.departmentId === level.departmentId && u.level === level.level).length;

  const attempt = async (task: () => Promise<unknown>) => {
    try {
      await task();
      await reload();
      setNotice(null);
      return true;
    } catch (e) {
      setNotice(errorMessage(e));
      return false;
    }
  };

  const save = async (level: JobLevel) => {
    const agreed = await confirm({
      title: "บันทึกการแก้ไข Level?",
      message: `${level.name} · ${level.title}`,
      confirmLabel: "บันทึก",
    });
    if (agreed) await attempt(() => api.saveLevel(level));
  };

  const remove = async (level: JobLevel) => {
    const agreed = await confirm({
      title: "ลบ Level นี้?",
      message: `${level.name} · ${level.title}`,
      confirmLabel: "ลบ",
      tone: "danger",
    });
    if (agreed) await attempt(() => api.deleteLevel(level));
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return setNotice("กรุณากรอกชื่อระดับ");
    setAdding(true);
    const added = await attempt(() =>
      api.saveLevel({ departmentId, level: nextLevel, name: newName.trim(), title: newTitle.trim() }),
    );
    setAdding(false);
    if (added) {
      setNewName("");
      setNewTitle("");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">ฝ่ายและ Level</h1>
        <p className="mt-1 text-sm text-muted">
          เพิ่ม ลบ แก้ไข Level และชื่อตำแหน่งของแต่ละฝ่าย · ลำดับ 1 คือระดับเริ่มต้น
        </p>
      </div>

      <section className="card p-5">
        <div className="mb-2 text-xs font-medium text-muted">ฝ่าย (Department)</div>
        <div className="flex flex-wrap gap-2">
          {DEPARTMENTS.map((department) => (
            <button
              key={department.id}
              type="button"
              aria-pressed={departmentId === department.id}
              onClick={() => {
                setDepartmentId(department.id);
                setNotice(null);
              }}
              className={segment(departmentId === department.id)}
            >
              {department.name}
            </button>
          ))}
        </div>
      </section>

      {notice && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {notice}
        </p>
      )}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="sheet min-w-[720px]">
            <thead>
              <tr>
                <th className="w-16 text-center">ลำดับ</th>
                <th className="w-56">ชื่อระดับ</th>
                <th>ชื่อตำแหน่ง</th>
                <th className="w-24 text-center">พนักงาน</th>
                <th className="w-24" aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {levels.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted">
                    ฝ่ายนี้ยังไม่มี Level
                  </td>
                </tr>
              )}
              {levels.map((level) => (
                <LevelRow
                  // Remount after a save so the inputs pick up the stored values.
                  key={`${level.departmentId}-${level.level}-${level.name}-${level.title}`}
                  level={level}
                  headcount={headcount(level)}
                  onSave={save}
                  onDelete={remove}
                />
              ))}
            </tbody>
          </table>
        </div>

        <form
          onSubmit={add}
          className="flex flex-wrap items-end gap-3 border-t border-line bg-canvas/70 px-5 py-4"
        >
          <label className="block w-56">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              ชื่อระดับ (ลำดับ {nextLevel})
            </span>
            <input
              className="field bg-white"
              placeholder="เช่น Level 5"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
          <label className="block min-w-[240px] flex-1">
            <span className="mb-1.5 block text-xs font-medium text-muted">ชื่อตำแหน่ง</span>
            <input
              className="field bg-white"
              placeholder="เช่น Principal Designer"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={adding}>
            {adding ? "กำลังเพิ่ม…" : "+ เพิ่ม Level"}
          </button>
        </form>
      </section>

      <p className="text-xs text-muted">
        Level ที่เพิ่มใหม่จะได้แบบประเมินเริ่มต้นชุดเดียวกับ Level 3 ของฝ่ายนั้น แก้ไขข้อประเมินได้ที่เมนู
        กำหนดหัวข้อประเมิน
      </p>
    </div>
  );
}
