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
}

/** A menu that opens to show its sub-menu instead of leading to a page. */
interface NavGroup {
  label: string;
  icon: string;
  children: NavItem[];
}

const isGroup = (entry: NavItem | NavGroup): entry is NavGroup => "children" in entry;

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

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

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`${ROW} ${active ? "bg-accent font-medium text-white" : "text-ink hover:bg-black/5"}`}
    >
      <NavIcon path={item.icon} />
      {item.label}
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
        <NavIcon path={group.icon} />
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
};

function navItems(user: User): (NavItem | NavGroup)[] {
  const ownForm: NavItem[] = isEmployee(user)
    ? [{ href: `/evaluate/${user.id}`, label: "แบบประเมินของฉัน", icon: ICONS.form }]
    : [];
  if (user.role === "admin") {
    return [
      { href: "/admin/dashboard", label: "Dashboard", icon: ICONS.dashboard },
      { href: "/admin/evaluations", label: "รายการประเมิน", icon: ICONS.list },
      { href: "/admin/employees", label: "ข้อมูลพนักงาน", icon: ICONS.people },
      { href: "/admin/forms", label: "กำหนดหัวข้อประเมิน", icon: ICONS.builder },
      ...ownForm,
      {
        label: "ฐานข้อมูล",
        icon: ICONS.database,
        children: [
          { href: "/admin/levels", label: "ฝ่ายและ Level", icon: ICONS.levels },
          { href: "/admin/cycles", label: "รอบประเมิน", icon: ICONS.cycles },
          { href: "/admin/scale-rating", label: "Scale & Rating", icon: ICONS.scale },
        ],
      },
    ];
  }
  if (user.role === "supervisor") {
    return [{ href: "/team", label: "ทีมของฉัน", icon: ICONS.team }, ...ownForm];
  }
  return ownForm;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, cycle, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const onLogin = pathname === "/login";
  const allowed = user ? canAccessPath(user, pathname) : false;

  useEffect(() => {
    if (!ready) return;
    if (!user && !onLogin) router.replace("/login");
    else if (user && (onLogin || !allowed)) router.replace(homePath(user));
  }, [ready, user, onLogin, allowed, router]);

  if (onLogin) return <>{children}</>;
  // Render nothing while the session loads or a redirect is pending.
  if (!ready || !user || !allowed) return null;

  const items = navItems(user);
  const department = DEPARTMENTS.find((d) => d.id === user.departmentId)?.name;

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="z-30 flex flex-col border-b border-black/10 bg-white/80 backdrop-blur-xl print:hidden lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-b-0 lg:border-r">
        <div className="px-5 pb-2 pt-5 lg:pb-6 lg:pt-7">
          <div className="text-[15px] font-semibold tracking-tight text-ink">{COMPANY_NAME}</div>
          <div className="text-xs text-faint">Performance Appraisal{cycle ? ` · ${cycle.id}` : ""}</div>
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
          <button type="button" className="btn-secondary shrink-0 py-1.5 text-xs" onClick={() => void logout()}>
            ออกจากระบบ
          </button>
        </div>
      </aside>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 lg:py-10">{children}</main>
    </div>
  );
}
