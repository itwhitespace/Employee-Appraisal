"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import EmployeeDialog from "@/components/EmployeeDialog";
import IconButton from "@/components/IconButton";
import StatusBadge from "@/components/StatusBadge";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DEPARTMENTS, ROLE_NAMES } from "@/lib/constants";
import { departmentRank, findLevel, isEmployee } from "@/lib/evaluation";
import { formatDate } from "@/lib/format";
import { useOverview } from "@/lib/overview";
import type { EmployeeInput, Role, User } from "@/lib/types";

const ROLE_CHIPS: Record<Role, string> = {
  employee: "bg-black/5 text-muted",
  supervisor: "bg-accent-soft text-accent",
  admin: "bg-violet-50 text-violet-700",
};

const NO_TEAM = "ไม่ระบุทีม";
const COLUMNS = 8;

const segment = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-sm transition ${
    active ? "bg-ink font-medium text-white" : "bg-black/5 text-ink hover:bg-black/10"
  }`;

const teamOf = (user: User) => user.team || NO_TEAM;

/** One colour per team, in the order the teams are listed. Full class names, for Tailwind. */
const TEAM_TONES = [
  { band: "border-sky-500 bg-sky-100 text-sky-900", dot: "bg-sky-500" },
  { band: "border-emerald-500 bg-emerald-100 text-emerald-900", dot: "bg-emerald-500" },
  { band: "border-violet-500 bg-violet-100 text-violet-900", dot: "bg-violet-500" },
  { band: "border-amber-500 bg-amber-100 text-amber-900", dot: "bg-amber-500" },
  { band: "border-rose-500 bg-rose-100 text-rose-900", dot: "bg-rose-500" },
  { band: "border-teal-500 bg-teal-100 text-teal-900", dot: "bg-teal-500" },
  { band: "border-indigo-500 bg-indigo-100 text-indigo-900", dot: "bg-indigo-500" },
  { band: "border-orange-500 bg-orange-100 text-orange-900", dot: "bg-orange-500" },
  { band: "border-fuchsia-500 bg-fuchsia-100 text-fuchsia-900", dot: "bg-fuchsia-500" },
  { band: "border-lime-600 bg-lime-100 text-lime-900", dot: "bg-lime-600" },
];
const NO_TEAM_TONE = { band: "border-slate-400 bg-slate-100 text-slate-700", dot: "bg-slate-400" };

/**
 * By team, each team kept together even when its people are in different departments.
 * Teams come in the order of the first department among their people (the studios first),
 * people without a team last; inside a team, by department, then the most senior first.
 */
function sortByTeam(users: User[]): User[] {
  const teamRank = new Map<string, number>();
  for (const user of users) {
    const rank = user.team ? departmentRank(user.departmentId) : DEPARTMENTS.length + 1;
    teamRank.set(teamOf(user), Math.min(teamRank.get(teamOf(user)) ?? rank, rank));
  }
  return [...users].sort(
    (a, b) =>
      (teamRank.get(teamOf(a)) ?? 0) - (teamRank.get(teamOf(b)) ?? 0) ||
      teamOf(a).localeCompare(teamOf(b), undefined, { numeric: true }) ||
      departmentRank(a.departmentId) - departmentRank(b.departmentId) ||
      (b.level ?? 0) - (a.level ?? 0) ||
      a.code.localeCompare(b.code),
  );
}

/** `null` = closed, "new" = adding, a user = editing that user. */
type DialogState = null | "new" | User;

export default function EmployeesPage() {
  const { user: me } = useAuth();
  const confirm = useConfirm();
  const { data, error, reload } = useOverview();
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sorted = useMemo(() => sortByTeam(data?.users ?? []), [data]);

  const teams = useMemo(() => {
    const counts = new Map<string, number>();
    for (const user of sorted) counts.set(teamOf(user), (counts.get(teamOf(user)) ?? 0) + 1);
    return [...counts];
  }, [sorted]);

  // A team keeps its colour whatever the filter or search.
  const toneOf = (name: string) => {
    if (name === NO_TEAM) return NO_TEAM_TONE;
    const index = teams.findIndex(([teamName]) => teamName === name);
    return TEAM_TONES[Math.max(0, index) % TEAM_TONES.length];
  };

  const users = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sorted.filter(
      (user) =>
        (team === null || teamOf(user) === team) &&
        (!term ||
          [user.code, user.name, user.nickname, user.position, user.team].some((text) =>
            text.toLowerCase().includes(term),
          )),
    );
  }, [sorted, team, query]);

  if (error) return <div className="card p-8 text-center text-red-500">{error}</div>;
  if (!data) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const save = async (input: EmployeeInput, password: string): Promise<string | null> => {
    const adding = dialog === "new";
    const agreed = await confirm({
      title: adding ? "เพิ่มพนักงานคนนี้?" : "บันทึกการแก้ไข?",
      message: `${input.name} (${input.code})${
        !adding && password ? " — รหัสผ่านจะถูกเปลี่ยนเป็นรหัสใหม่" : ""
      }`,
      confirmLabel: "บันทึก",
    });
    if (!agreed) return null;
    try {
      if (dialog === "new") await api.createEmployee(input, password);
      else if (dialog) await api.updateEmployee(dialog.id, input, password);
      await reload();
      setDialog(null);
      setNotice(null);
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  };

  const remove = async (user: User) => {
    const agreed = await confirm({
      title: "ลบพนักงานคนนี้?",
      message: `${user.name} (${user.code})${
        isEmployee(user) ? " — แบบประเมินของพนักงานคนนี้จะถูกลบไปด้วย" : ""
      }`,
      confirmLabel: "ลบ",
      tone: "danger",
    });
    if (!agreed) return;
    try {
      await api.deleteEmployee(user.id);
      await reload();
      setNotice(null);
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };

  return (
    <div className="max-w-[1180px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">ข้อมูลพนักงาน</h1>
          <p className="mt-1 text-sm text-muted">
            {data.users.length} คน · เข้าสู่ระบบด้วยรหัสพนักงาน 5 หลักและรหัสผ่าน
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            className="field w-64 bg-white shadow-card"
            placeholder="ค้นหารหัส ชื่อ ชื่อเล่น ตำแหน่ง หรือทีม"
            aria-label="ค้นหาพนักงาน"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Link
            href="/admin/employees/import"
            className="btn rounded-full bg-emerald-700 text-white hover:bg-emerald-800"
          >
            Import Excel
          </Link>
          <button type="button" className="btn-primary" onClick={() => setDialog("new")}>
            + เพิ่มพนักงาน
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="กรองตาม Studio / Team">
        <button
          type="button"
          aria-pressed={team === null}
          onClick={() => setTeam(null)}
          className={segment(team === null)}
        >
          ทั้งหมด <span className="tabular-nums opacity-60">{data.users.length}</span>
        </button>
        {teams.map(([name, count]) => (
          <button
            key={name}
            type="button"
            aria-pressed={team === name}
            onClick={() => setTeam(name)}
            className={segment(team === name)}
          >
            <span
              className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${toneOf(name).dot}`}
              aria-hidden="true"
            />
            {name} <span className="tabular-nums opacity-60">{count}</span>
          </button>
        ))}
      </div>

      {notice && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {notice}
        </p>
      )}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="sheet min-w-[1000px] table-fixed">
            <thead>
              <tr>
                <th className="w-16">รหัส</th>
                <th>ชื่อ-สกุล / ตำแหน่ง</th>
                <th className="w-24">สิทธิ์</th>
                <th className="w-44">ฝ่าย / Level · ประเภท</th>
                <th className="w-48">ผู้ประเมิน</th>
                <th className="w-28">วันเริ่มงาน</th>
                <th className="w-36">แบบประเมิน</th>
                <th className="w-[108px]" aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS} className="py-6 text-center text-muted">
                    {query ? `ไม่พบพนักงานที่ตรงกับ “${query}”` : "ยังไม่มีพนักงานในระบบ"}
                  </td>
                </tr>
              )}
              {users.map((user, index) => {
                const appraised = isEmployee(user);
                const firstOfTeam = index === 0 || teamOf(users[index - 1]) !== teamOf(user);
                return (
                  <Fragment key={user.id}>
                    {firstOfTeam && (
                      <tr>
                        <td
                          colSpan={COLUMNS}
                          className={`border-l-[6px] py-2 text-sm font-semibold ${toneOf(teamOf(user)).band}`}
                        >
                          {teamOf(user)}{" "}
                          <span className="font-normal opacity-60">
                            {users.filter((u) => teamOf(u) === teamOf(user)).length} คน
                          </span>
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="font-semibold tabular-nums">{user.code}</td>
                      <td>
                        <div className="font-semibold">
                          {user.name}
                          {user.nickname && (
                            <span className="ml-1.5 font-normal text-muted">({user.nickname})</span>
                          )}
                        </div>
                        <div className="text-xs text-muted">{user.position}</div>
                      </td>
                      <td>
                        <span className={`chip ${ROLE_CHIPS[user.role]}`}>{ROLE_NAMES[user.role]}</span>
                      </td>
                      <td>
                        {DEPARTMENTS.find((d) => d.id === user.departmentId)?.name ?? "–"}
                        <div className="text-xs text-muted">
                          {[findLevel(data.levels, user.departmentId, user.level)?.name, user.appraisalType]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </td>
                      <td className="truncate whitespace-nowrap">
                        {data.users.find((u) => u.id === user.supervisorId)?.name ?? "–"}
                      </td>
                      <td className="whitespace-nowrap text-muted">{formatDate(user.startDate)}</td>
                      <td>
                        {appraised ? (
                          <StatusBadge status={data.evaluations[user.id]?.status ?? "not_started"} />
                        ) : (
                          <span className="text-faint">ไม่มีแบบประเมิน</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap !px-1.5 !py-1.5 text-right">
                        {appraised && (
                          <IconButton icon="view" label="เปิดดูแบบประเมิน" href={`/evaluate/${user.id}`} />
                        )}
                        <IconButton icon="edit" label="แก้ไข" onClick={() => setDialog(user)} />
                        <IconButton
                          icon="delete"
                          label={user.id === me?.id ? "ลบบัญชีของตัวเองไม่ได้" : "ลบ"}
                          tone="danger"
                          disabled={user.id === me?.id}
                          onClick={() => void remove(user)}
                        />
                      </td>
                    </tr>
                  </Fragment>
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
          levels={data.levels}
          onSave={save}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
