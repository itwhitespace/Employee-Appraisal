"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import EmployeeDialog from "@/components/EmployeeDialog";
import StatusBadge from "@/components/StatusBadge";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DEPARTMENTS, LEVELS, ROLE_NAMES } from "@/lib/constants";
import { isEmployee } from "@/lib/evaluation";
import { formatDate } from "@/lib/format";
import { useOverview } from "@/lib/overview";
import type { EmployeeInput, Role, User } from "@/lib/types";

const ROLE_CHIPS: Record<Role, string> = {
  employee: "bg-black/5 text-muted",
  supervisor: "bg-accent-soft text-accent",
  admin: "bg-violet-50 text-violet-700",
};

/** `null` = closed, "new" = adding, a user = editing that user. */
type DialogState = null | "new" | User;

export default function EmployeesPage() {
  const { user: me } = useAuth();
  const { data, error, reload } = useOverview();
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const users = useMemo(() => {
    const all = data?.users ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return all;
    return all.filter((user) =>
      [user.code, user.name, user.position, user.team].some((text) =>
        text.toLowerCase().includes(term),
      ),
    );
  }, [data, query]);

  if (error) return <div className="card p-8 text-center text-red-500">{error}</div>;
  if (!data) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const save = async (input: EmployeeInput): Promise<string | null> => {
    try {
      if (dialog === "new") await api.createEmployee(input);
      else if (dialog) await api.updateEmployee(dialog.id, input);
      await reload();
      setDialog(null);
      setNotice(null);
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  };

  const remove = async (user: User) => {
    const warning = isEmployee(user) ? " แบบประเมินของพนักงานคนนี้จะถูกลบไปด้วย" : "";
    if (!window.confirm(`ลบ ${user.name} (${user.code}) ออกจากระบบ?${warning}`)) return;
    try {
      await api.deleteEmployee(user.id);
      await reload();
      setNotice(null);
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">ข้อมูลพนักงาน</h1>
          <p className="mt-1 text-sm text-muted">
            {data.users.length} คน · รหัสพนักงาน 5 หลักใช้สำหรับเข้าสู่ระบบ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            className="field w-64 bg-white shadow-card"
            placeholder="ค้นหารหัส ชื่อ ตำแหน่ง หรือทีม"
            aria-label="ค้นหาพนักงาน"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="btn-primary" onClick={() => setDialog("new")}>
            + เพิ่มพนักงาน
          </button>
        </div>
      </div>

      {notice && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {notice}
        </p>
      )}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="sheet min-w-[1120px]">
            <thead>
              <tr>
                <th className="w-20">รหัส</th>
                <th className="min-w-[220px]">ชื่อ-สกุล / ตำแหน่ง</th>
                <th className="w-28">สิทธิ์</th>
                <th>ฝ่าย</th>
                <th className="w-28">Level</th>
                <th>Studio / Team</th>
                <th>ผู้ประเมิน</th>
                <th className="w-28">วันเริ่มงาน</th>
                <th className="w-36">แบบประเมิน</th>
                <th className="w-40" aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-muted">
                    {query ? `ไม่พบพนักงานที่ตรงกับ “${query}”` : "ยังไม่มีพนักงานในระบบ"}
                  </td>
                </tr>
              )}
              {users.map((user) => {
                const appraised = isEmployee(user);
                return (
                  <tr key={user.id}>
                    <td className="font-semibold tabular-nums">{user.code}</td>
                    <td>
                      <div className="font-semibold">{user.name}</div>
                      <div className="text-xs text-muted">{user.position}</div>
                    </td>
                    <td>
                      <span className={`chip ${ROLE_CHIPS[user.role]}`}>{ROLE_NAMES[user.role]}</span>
                    </td>
                    <td className="whitespace-nowrap">
                      {DEPARTMENTS.find((d) => d.id === user.departmentId)?.name ?? "–"}
                    </td>
                    <td>
                      {user.level
                        ? `L${user.level} · ${LEVELS.find((l) => l.id === user.level)?.name}`
                        : "–"}
                    </td>
                    <td>{user.team || "–"}</td>
                    <td className="whitespace-nowrap">
                      {data.users.find((u) => u.id === user.supervisorId)?.name ?? "–"}
                    </td>
                    <td className="text-muted">{formatDate(user.startDate)}</td>
                    <td>
                      {appraised ? (
                        <StatusBadge status={data.evaluations[user.id]?.status ?? "not_started"} />
                      ) : (
                        <span className="text-faint">ไม่มีแบบประเมิน</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {appraised && (
                        <Link href={`/evaluate/${user.id}`} className="btn-text">
                          เปิดดู
                        </Link>
                      )}
                      <button type="button" className="btn-text" onClick={() => setDialog(user)}>
                        แก้ไข
                      </button>
                      {user.id !== me?.id && (
                        <button type="button" className="btn-text-danger" onClick={() => remove(user)}>
                          ลบ
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {dialog && (
        <EmployeeDialog
          key={dialog === "new" ? "new" : dialog.id}
          editing={dialog === "new" ? null : dialog}
          users={data.users}
          onSave={save}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
