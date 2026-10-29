"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { COMPANY_NAME, DEPARTMENTS, ROLE_NAMES } from "@/lib/constants";
import { isEmployee } from "@/lib/evaluation";
import { canAccessPath, homePath } from "@/lib/permissions";
import type { User } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  /** SVG path data, drawn on a 20x20 grid. */
  icon: string;
  /** Opens in a new browser tab. */
  newTab?: boolean;
  tone?: Tone;
}

/** A menu that opens to show its sub-menu instead of leading to a page. */
interface NavGroup {
  label: string;
  icon: string;
  tone?: Tone;
  children: NavItem[];
}

/** Each menu's icon sits on a soft tile of its own colour. Full class names, for Tailwind. */
const TONES = {
  sky: "bg-sky-100 text-sky-600",
  emerald: "bg-emerald-100 text-emerald-600",
  violet: "bg-violet-100 text-violet-600",
  amber: "bg-amber-100 text-amber-600",
  rose: "bg-rose-100 text-rose-600",
  indigo: "bg-indigo-100 text-indigo-600",
  teal: "bg-teal-100 text-teal-600",
  orange: "bg-orange-100 text-orange-600",
  fuchsia: "bg-fuchsia-100 text-fuchsia-600",
  slate: "bg-slate-100 text-slate-600",
} as const;

type Tone = keyof typeof TONES;

function ToneIcon({ path, tone = "slate", active = false }: { path: string; tone?: Tone; active?: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
        active ? "bg-white/20 text-white" : TONES[tone]
      }`}
    >
      <NavIcon path={path} className="!h-4 !w-4" />
    </span>
  );
}

const isGroup = (entry: NavItem | NavGroup): entry is NavGroup => "children" in entry;

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

const CHEVRON = "M7.5 5l5 5-5 5";

function NavIcon({ path, className = "" }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-[18px] w-[18px] shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const ROW = "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition";

const NEW_TAB = "M8.5 4.5h-4v11h11v-4M11.5 3.5h5v5M16.5 3.5l-7 7";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const activeColor = pathname.startsWith("/compensation") ? "bg-teal-600" : "bg-accent";
  return (
    <Link
      href={item.href}
      target={item.newTab ? "_blank" : undefined}
      rel={item.newTab ? "noopener" : undefined}
      aria-current={active ? "page" : undefined}
      className={`${ROW} ${active ? `${activeColor} font-medium text-white` : "text-ink hover:bg-black/5"}`}
    >
      <ToneIcon path={item.icon} tone={item.tone} active={active} />
      <span className="flex-1">{item.label}</span>
      {item.newTab && (
        <>
          <NavIcon path={NEW_TAB} className="!h-3.5 !w-3.5 text-faint" />
          <span className="sr-only">(เปิดแท็บใหม่)</span>
        </>
      )}
    </Link>
  );
}

function NavMenu({ group, pathname }: { group: NavGroup; pathname: string }) {
  const containsPage = group.children.some((child) => isActive(pathname, child.href));
  const [open, setOpen] = useState(containsPage);

  // Arriving on a sub-menu page from elsewhere opens its menu.
  useEffect(() => {
    if (containsPage) setOpen(true);
  }, [containsPage]);

  return (
    <div className="flex shrink-0 gap-1 lg:flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`${ROW} w-full text-left text-ink hover:bg-black/5`}
      >
        <ToneIcon path={group.icon} tone={group.tone} />
        <span className="flex-1">{group.label}</span>
        <NavIcon path={CHEVRON} className={`text-faint transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="flex gap-1 lg:ml-[21px] lg:flex-col lg:border-l lg:border-line lg:pl-2">
          {group.children.map((child) => (
            <NavLink key={child.href} item={child} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  );
}

const ICONS = {
  form: "M6 3h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1.5 4h5M7.5 10h5M7.5 13h3",
  team: "M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm6.5 0a2 2 0 1 0 0-4M2.5 16c0-2.2 2-4 4.5-4s4.5 1.8 4.5 4m2-3.8c1.9.3 3.5 1.8 3.5 3.8",
  list: "M7.5 5.5h9M7.5 10h9M7.5 14.5h9M3.75 5.5h.5M3.75 10h.5M3.75 14.5h.5",
  dashboard: "M3.5 3.5h5.5v5.5H3.5zM11 3.5h5.5v5.5H11zM3.5 11h5.5v5.5H3.5zM11 11h5.5v5.5H11z",
  people: "M10 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 16.5c0-2.8 2.7-5 6-5s6 2.2 6 5",
  levels: "M3.5 16.5h4v-4h4v-4h4v-4h1",
  database:
    "M4 5.5c0-1.1 2.7-2 6-2s6 .9 6 2-2.7 2-6 2-6-.9-6-2Zm0 0v9c0 1.1 2.7 2 6 2s6-.9 6-2v-9M4 10c0 1.1 2.7 2 6 2s6-.9 6-2",
  scale: "M10 3.5l1.9 4 4.4.6-3.2 3 .8 4.4-3.9-2.1-3.9 2.1.8-4.4-3.2-3 4.4-.6z",
  cycles: "M4 5.5h12v11H4zM4 8.5h12M7 3.5v3M13 3.5v3",
  builder: "M4 6h7m4 0h1M4 10h2m4 0h6M4 14h8m4 0h0M13 4.5v3M8 8.5v3M14 12.5v3",
  gift: "M3.5 8.5h13v3h-13zM4.5 11.5v5h11v-5M10 8.5v8M10 8.5S8.5 4 6.5 4.5 7 8.5 10 8.5Zm0 0s1.5-4.5 3.5-4 .5 4-3.5 4Z",
  history: "M10 3.5a6.5 6.5 0 1 1-6.1 4.3M3.5 4v4h4M10 6.5V10l2.5 1.5",
  raise: "M3.5 14.5l4.5-4.5 3 3 5.5-5.5M12 7.5h4.5V12",
  money: "M3 5.5h14v9H3zM10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5.5 8v4M14.5 8v4",
};

/** The compensation pages: a space of their own, opened in a separate tab. */
const COMPENSATION_ITEMS: NavItem[] = [
  { href: "/compensation/salaries", label: "ฐานเงินเดือนพนักงาน", icon: ICONS.people, tone: "sky" },
  { href: "/compensation/merit", label: "ปรับเงินเดือนประจำปี", icon: ICONS.raise, tone: "emerald" },
  { href: "/compensation/bonus", label: "โบนัสประจำปี", icon: ICONS.gift, tone: "rose" },
  { href: "/compensation/structure", label: "โครงสร้างเงินเดือน", icon: ICONS.levels, tone: "violet" },
  { href: "/compensation/audit", label: "ประวัติการเข้าถึง", icon: ICONS.history, tone: "amber" },
];

function navItems(user: User, inCompensation: boolean): (NavItem | NavGroup)[] {
  if (inCompensation) return COMPENSATION_ITEMS;
  const compensation: NavItem[] = user.compensationAccess
    ? [
        {
          href: COMPENSATION_ITEMS[0].href,
          label: "ค่าตอบแทน",
          icon: ICONS.money,
          newTab: true,
          tone: "emerald" as const,
        },
      ]
    : [];
  return [...roleItems(user), ...compensation];
}

function roleItems(user: User): (NavItem | NavGroup)[] {
  const ownForm: NavItem[] = isEmployee(user)
    ? [{ href: `/evaluate/${user.id}`, label: "แบบประเมินของฉัน", icon: ICONS.form, tone: "rose" as const }]
    : [];
  if (user.role === "admin") {
    return [
      { href: "/admin/dashboard", label: "Dashboard", icon: ICONS.dashboard, tone: "indigo" },
      { href: "/admin/evaluations", label: "รายการประเมิน", icon: ICONS.list, tone: "sky" },
      { href: "/admin/employees", label: "ข้อมูลพนักงาน", icon: ICONS.people, tone: "teal" },
      { href: "/admin/forms", label: "กำหนดหัวข้อประเมิน", icon: ICONS.builder, tone: "amber" },
      ...ownForm,
      {
        label: "ฐานข้อมูล",
        icon: ICONS.database,
        tone: "violet",
        children: [
          { href: "/admin/levels", label: "ฝ่ายและ Level", icon: ICONS.levels, tone: "teal" },
          { href: "/admin/cycles", label: "รอบประเมิน", icon: ICONS.cycles, tone: "orange" },
          { href: "/admin/scale-rating", label: "Scale & Rating", icon: ICONS.scale, tone: "fuchsia" },
        ],
      },
    ];
  }
  // Supervisors are not appraised themselves.
  if (user.role === "supervisor") {
    return [{ href: "/team", label: "ทีมของฉัน", icon: ICONS.team, tone: "sky" }];
  }
  return ownForm;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, cycle, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const onLogin = pathname === "/login";
  const inCompensation = pathname.startsWith("/compensation");
  const allowed = user ? canAccessPath(user, pathname) : false;

  // Tells the two tabs apart.
  useEffect(() => {
    document.title = inCompensation
      ? "Compensation | Whitespace Partners"
      : "Performance Appraisal | Whitespace Partners";
  }, [inCompensation]);

  useEffect(() => {
    if (!ready) return;
    if (!user && !onLogin) router.replace("/login");
    else if (user && (onLogin || !allowed)) router.replace(homePath(user));
  }, [ready, user, onLogin, allowed, router]);

  if (onLogin) return <>{children}</>;
  // Render nothing while the session loads or a redirect is pending.
  if (!ready || !user || !allowed) return null;

  const items = navItems(user, inCompensation);
  const department = DEPARTMENTS.find((d) => d.id === user.departmentId)?.name;

  return (
    <div className="min-h-screen lg:pl-64 print:pl-0">
      <aside className="z-30 flex flex-col border-b border-black/10 bg-white/80 backdrop-blur-xl print:hidden lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-b-0 lg:border-r">
        <div className="px-5 pb-2 pt-5 lg:pb-6 lg:pt-7">
          <div className="text-[15px] font-semibold tracking-tight text-ink">{COMPANY_NAME}</div>
          {inCompensation ? (
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
              <NavIcon path={ICONS.money} className="!h-3.5 !w-3.5" />
              Compensation
            </div>
          ) : (
            <div className="text-xs text-faint">Performance Appraisal{cycle ? ` · ${cycle.id}` : ""}</div>
          )}
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:pb-0">
          {items.map((entry) =>
            isGroup(entry) ? (
              <NavMenu key={entry.label} group={entry} pathname={pathname} />
            ) : (
              <NavLink key={entry.href} item={entry} pathname={pathname} />
            ),
          )}
        </nav>

        <div className="flex items-center justify-between gap-3 border-t border-black/5 px-5 py-3 lg:flex-col lg:items-stretch lg:py-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink">{user.name}</div>
            <div className="truncate text-xs text-faint">
              {ROLE_NAMES[user.role]} · รหัส {user.code}
            </div>
            {user.team && <div className="truncate text-xs text-faint">{user.team}</div>}
            {department && <div className="truncate text-xs text-faint">{department}</div>}
          </div>
          <div className="flex shrink-0 gap-2 lg:flex-col">
            {inCompensation && (
              <Link href={homePath(user)} className="btn-secondary py-1.5 text-xs">
                ไประบบประเมิน
              </Link>
            )}
            <button type="button" className="btn-secondary py-1.5 text-xs" onClick={() => void logout()}>
              ออกจากระบบ
            </button>
          </div>
        </div>
      </aside>

      <main
        className={`mx-auto px-4 py-6 lg:py-10 print:max-w-none print:p-0 ${
          // The compensation tables are wide: they get the whole screen.
          inCompensation ? "compensation max-w-[1920px] sm:px-6" : "max-w-[1400px] sm:px-8"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
