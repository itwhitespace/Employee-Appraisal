"use client";

import { useEffect, useRef, useState } from "react";
import { APPRAISAL_TYPES, DEPARTMENTS, ROLE_NAMES } from "@/lib/constants";
import { findLevel } from "@/lib/evaluation";
import type {
  AppraisalType,
  DepartmentId,
  EmployeeInput,
  JobLevel,
  Role,
  User,
} from "@/lib/types";

interface EmployeeDialogProps {
  /** The employee being edited, or null to add a new one. */
  editing: User | null;
  /** Everyone who can be chosen as the appraiser. */
  users: User[];
  levels: JobLevel[];
  /** `password` is empty when it is not being changed. Resolves to an error message, or null when saved. */
  onSave: (input: EmployeeInput, password: string) => Promise<string | null>;
  onClose: () => void;
}

const BLANK: EmployeeInput = {
  code: "",
  name: "",
  nickname: "",
  role: "employee",
  position: "",
  team: "",
  departmentId: null,
  level: null,
  supervisorId: null,
  startDate: null,
  levelSince: null,
  appraisalType: "Annual",
};

const ROLES: Role[] = ["employee", "supervisor", "admin"];

export default function EmployeeDialog({
  editing,
  users,
  levels,
  onSave,
  onClose,
}: EmployeeDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<EmployeeInput>(() => {
    if (!editing) return BLANK;
    const { id: _id, ...rest } = editing;
    return rest;
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A native modal <dialog> gives focus trapping and Esc-to-close.
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const set = (patch: Partial<EmployeeInput>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{5}$/.test(form.code)) return setError("รหัสพนักงานต้องเป็นตัวเลข 5 หลัก");
    if (!form.name.trim()) return setError("กรุณากรอกชื่อ-สกุล");
    const newPassword = password.trim();
    if (!editing && !newPassword) return setError("กรุณากำหนดรหัสผ่าน");
    if (newPassword && newPassword.length < 5) return setError("รหัสผ่านต้องมีอย่างน้อย 5 ตัวอักษร");
    setBusy(true);
    const problem = await onSave(form, newPassword);
    setBusy(false);
    if (problem) setError(problem);
  };

  const supervisors = users.filter((u) => u.id !== editing?.id && u.role !== "employee");
  const departmentLevels = levels.filter((l) => l.departmentId === form.departmentId);
  const hasForm = form.departmentId !== null && form.level !== null && form.supervisorId !== null;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="w-full max-w-2xl rounded-2xl p-0 shadow-float backdrop:bg-black/30 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={submit} noValidate>
        <header className="border-b border-line px-6 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">
            {editing ? "แก้ไขข้อมูลพนักงาน" : "เพิ่มพนักงาน"}
          </h2>
        </header>

        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">รหัสพนักงาน (5 หลัก)</span>
            <input
              className="field tabular-nums"
              inputMode="numeric"
              maxLength={5}
              value={form.code}
              onChange={(e) => set({ code: e.target.value.replace(/\D/g, "").slice(0, 5) })}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">ชื่อ-สกุล</span>
            <input className="field" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">ชื่อเล่น</span>
            <input
              className="field"
              maxLength={60}
              value={form.nickname}
              onChange={(e) => set({ nickname: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              {editing ? "ตั้งรหัสผ่านใหม่" : "รหัสผ่าน"}
            </span>
            <input
              className="field tabular-nums"
              autoComplete="off"
              maxLength={64}
              placeholder={editing ? "เว้นว่างไว้ถ้าไม่เปลี่ยน" : "เลขบัตรประชาชน 5 ตัวท้าย"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">สิทธิ์การใช้งาน</span>
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
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">ตำแหน่ง</span>
            <input
              className="field"
              value={form.position}
              onChange={(e) => set({ position: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">ฝ่าย</span>
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
              <option value="">– ไม่ระบุ –</option>
              {DEPARTMENTS.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Level</span>
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
              <option value="">{form.departmentId ? "– ไม่ระบุ –" : "– เลือกฝ่ายก่อน –"}</option>
              {departmentLevels.map((level) => (
                <option key={level.level} value={level.level}>
                  {level.name} · {level.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">ประเภทการประเมิน</span>
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
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Studio / Team</span>
            <input className="field" value={form.team} onChange={(e) => set({ team: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">ผู้ประเมิน</span>
            <select
              className="field"
              value={form.supervisorId ?? ""}
              onChange={(e) => set({ supervisorId: e.target.value || null })}
            >
              <option value="">– ไม่มี –</option>
              {supervisors.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.code})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">วันเริ่มงาน</span>
            <input
              type="date"
              className="field"
              value={form.startDate ?? ""}
              onChange={(e) => set({ startDate: e.target.value || null })}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">วันที่เริ่มระดับปัจจุบัน</span>
            <input
              type="date"
              className="field"
              value={form.levelSince ?? ""}
              onChange={(e) => set({ levelSince: e.target.value || null })}
            />
          </label>

          <p className="text-xs text-muted sm:col-span-2">
            {hasForm
              ? "พนักงานคนนี้จะมีแบบประเมินตามฝ่ายและ Level ที่เลือก"
              : "ต้องระบุฝ่าย Level และผู้ประเมินให้ครบ พนักงานจึงจะมีแบบประเมิน"}
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-500 sm:col-span-2">
              {error}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <button type="button" className="btn-secondary" onClick={() => dialog.current?.close()}>
            ยกเลิก
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
