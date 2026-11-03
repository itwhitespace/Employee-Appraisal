"use client";

import { useEffect, useRef, useState } from "react";
import PasswordField, { toDigits } from "@/components/PasswordField";
import { APPRAISAL_TYPES, DEPARTMENTS, ROLE_NAMES } from "@/lib/constants";
import {
  draftProblems,
  type NewPersonForm,
  type Person,
  supervisorChoices,
  usualSupervisor,
} from "@/lib/employee-import";
import { findLevel } from "@/lib/evaluation";
import type { AppraisalType, DepartmentId, ImportedEmployee, JobLevel, Role } from "@/lib/types";

interface NewEmployeeDialogProps {
  /** What the file says, or what was filled in before. */
  initial: NewPersonForm;
  /** Row of the sheet the person comes from, for the heading. */
  sheetRow: number;
  directory: Person[];
  levels: JobLevel[];
  /** Other new people of this import who may be named as the supervisor. */
  newSupervisors: { code: string; label: string }[];
  /** Codes in the system and of the other new people of this import. */
  takenCodes: Set<string>;
  onSave: (employee: ImportedEmployee) => void;
  onClose: () => void;
}

const ROLES: Role[] = ["employee", "supervisor", "admin"];

/** Required field: a red star in the label, a red edge while it is still wrong. */
function Field({
  label,
  problem,
  required = false,
  hint,
  children,
}: {
  label: string;
  problem?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${problem ? "[&_.field]:!border-red-400" : ""}`}>
      <span className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {problem ? (
        <span className="mt-1 block text-xs text-red-600">{problem}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-muted">{hint}</span>
      )}
    </label>
  );
}

/**
 * Adds someone the file names but the system does not have yet. Filled in from the file;
 * nothing is saved until the import itself is confirmed.
 */
export default function NewEmployeeDialog({
  initial,
  sheetRow,
  directory,
  levels,
  newSupervisors,
  takenCodes,
  onSave,
  onClose,
}: NewEmployeeDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<NewPersonForm>(initial);
  /** The supervisor follows the department and team until one is picked by hand. */
  const [bossPicked, setBossPicked] = useState(initial.supervisorCode !== "");
  const [tried, setTried] = useState(false);

  // A native modal <dialog> gives focus trapping and Esc-to-close.
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const options = [...supervisorChoices(directory), ...newSupervisors]
    .filter((option) => option.code !== form.code)
    .sort((a, b) => a.label.localeCompare(b.label, "th"));
  const supervisorCodes = new Set([...directory.map((p) => p.code), ...newSupervisors.map((o) => o.code)]);
  const problems = draftProblems(form, { levels, takenCodes, supervisorCodes });
  const shown = tried ? problems : {};

  const set = (patch: Partial<NewPersonForm>) =>
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (!bossPicked && next.departmentId && ("departmentId" in patch || "team" in patch)) {
        next.supervisorCode = usualSupervisor(directory, next.departmentId, next.team);
      }
      return next;
    });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (Object.keys(problems).length > 0) return;
    onSave({
      ...form,
      departmentId: form.departmentId!,
      level: form.level!,
      name: form.name.trim(),
    });
    dialog.current?.close();
  };

  const departmentLevels = levels.filter((l) => l.departmentId === form.departmentId);
  // Teams already in use, to pick from.
  const teams = [...new Set(directory.map((p) => p.team.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "th", { numeric: true }),
  );
  const autoBoss = !bossPicked && form.supervisorCode !== "";

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="w-full max-w-3xl rounded-2xl p-0 shadow-float backdrop:bg-black/30 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={submit} noValidate>
        <header className="border-b border-line px-6 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">
            เพิ่มพนักงานใหม่ · แถว {sheetRow} ในไฟล์
          </h2>
          <p className="text-xs text-muted">
            กรอกไว้ให้แล้วจากไฟล์ ช่อง <span className="text-red-600">*</span> ต้องมีให้ครบ ·
            ยังไม่บันทึกลงระบบจนกว่าจะกดนำเข้า
          </p>
        </header>

        <div className="grid max-h-[70vh] gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
          <Field label="รหัสพนักงาน (5 หลัก)" required problem={shown.code}>
            <input
              className="field tabular-nums"
              inputMode="numeric"
              maxLength={5}
              value={form.code}
              onChange={(e) => set({ code: toDigits(e.target.value).slice(0, 5) })}
            />
          </Field>
          <Field label="ชื่อ-สกุล" required problem={shown.name}>
            <input className="field" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="ชื่อเล่น">
            <input
              className="field"
              maxLength={60}
              value={form.nickname}
              onChange={(e) => set({ nickname: e.target.value })}
            />
          </Field>
          <Field
            label="รหัสผ่านเข้าระบบ"
            problem={shown.password}
            hint="เลขบัตรประชาชน 5 ตัวท้าย · เว้นว่างได้ (เข้าระบบไม่ได้จนกว่า IT จะตั้งให้)"
          >
            <PasswordField
              className="field tabular-nums"
              autoComplete="new-password"
              inputMode="numeric"
              maxLength={5}
              placeholder="เลขบัตรประชาชน 5 ตัวท้าย"
              value={form.password}
              onChange={(e) => set({ password: toDigits(e.target.value).slice(0, 5) })}
            />
          </Field>
          <Field
            label="สิทธิ์การใช้งาน"
            hint={form.role === "admin" ? "แอดมินไม่ต้องมีหัวหน้าก็ได้" : undefined}
          >
            <select
              className="field"
              value={form.role}
              onChange={(e) => set({ role: e.target.value as Role })}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_NAMES[role]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ตำแหน่ง">
            <input
              className="field"
              value={form.position}
              onChange={(e) => set({ position: e.target.value })}
            />
          </Field>
          <Field label="ฝ่าย" required problem={shown.departmentId}>
            <select
              className="field"
              value={form.departmentId ?? ""}
              onChange={(e) => {
                const departmentId = (e.target.value || null) as DepartmentId | null;
                // Keep the level only if the new department has it too.
                const kept = findLevel(levels, departmentId, form.level);
                set({ departmentId, level: kept ? form.level : null });
              }}
            >
              <option value="">– เลือกฝ่าย –</option>
              {DEPARTMENTS.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Level" required problem={shown.level}>
            <select
              className="field"
              value={form.level ?? ""}
              disabled={form.departmentId === null}
              onChange={(e) => {
                const level = e.target.value ? Number(e.target.value) : null;
                const title = findLevel(levels, form.departmentId, level)?.title;
                // Fill in the job title of the level unless a position was already typed.
                set({ level, position: form.position.trim() || !title ? form.position : title });
              }}
            >
              <option value="">{form.departmentId ? "– เลือก Level –" : "– เลือกฝ่ายก่อน –"}</option>
              {departmentLevels.map((level) => (
                <option key={level.level} value={level.level}>
                  {level.name} · {level.title}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Studio / Team"
            hint={form.team && !teams.includes(form.team) ? "ชื่อทีมจากไฟล์ ยังไม่มีในระบบ" : undefined}
          >
            <select className="field" value={form.team} onChange={(e) => set({ team: e.target.value })}>
              <option value="">– ไม่ระบุ –</option>
              {form.team && !teams.includes(form.team) && (
                <option value={form.team}>{form.team} (จากไฟล์)</option>
              )}
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="หัวหน้า (ผู้ประเมิน)"
            required={form.role !== "admin"}
            problem={shown.supervisorCode}
            hint={autoBoss ? "เลือกให้อัตโนมัติจากฝ่าย / ทีม เปลี่ยนได้" : undefined}
          >
            <select
              className="field"
              value={form.supervisorCode}
              onChange={(e) => {
                setBossPicked(true);
                set({ supervisorCode: e.target.value });
              }}
            >
              <option value="">{form.role === "admin" ? "– ไม่มี –" : "– เลือกหัวหน้า –"}</option>
              {options.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ประเภทการประเมิน">
            <select
              className="field"
              value={form.appraisalType}
              onChange={(e) => set({ appraisalType: e.target.value as AppraisalType })}
            >
              {APPRAISAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>
          <Field label="วันเกิด">
            <input
              type="date"
              className="field"
              max={new Date().toISOString().slice(0, 10)}
              value={form.birthDate ?? ""}
              onChange={(e) => set({ birthDate: e.target.value || null })}
            />
          </Field>
          <Field label="วันเริ่มงาน">
            <input
              type="date"
              className="field"
              value={form.startDate ?? ""}
              onChange={(e) => set({ startDate: e.target.value || null })}
            />
          </Field>
          <Field label="อยู่ Level นี้ตั้งแต่">
            <input
              type="date"
              className="field"
              value={form.levelSince ?? ""}
              onChange={(e) => set({ levelSince: e.target.value || null })}
            />
          </Field>
          {tried && Object.keys(problems).length > 0 && (
            <p role="alert" className="text-sm text-red-600 sm:col-span-2">
              ยังขาด: {Object.values(problems).join(" · ")}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <button type="button" className="btn-secondary" onClick={() => dialog.current?.close()}>
            ยกเลิก
          </button>
          <button type="submit" className="btn-primary">
            บันทึกข้อมูลคนนี้
          </button>
        </footer>
      </form>
    </dialog>
  );
}
