"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { COMPANY_NAME, ROLE_NAMES, cycleLabel } from "@/lib/constants";
import { isEmployee } from "@/lib/evaluation";
import { canAccessPath, homePath } from "@/lib/permissions";
import type { User } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  /** SVG path data, drawn on a 20x20 grid. */
  icon: string;
}

const ICONS = {
  form: "M6 3h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1.5 4h5M7.5 10h5M7.5 13h3",
  team: "M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm6.5 0a2 2 0 1 0 0-4M2.5 16c0-2.2 2-4 4.5-4s4.5 1.8 4.5 4m2-3.8c1.9.3 3.5 1.8 3.5 3.8",
  dashboard: "M3.5 3.5h5.5v5.5H3.5zM11 3.5h5.5v5.5H11zM3.5 11h5.5v5.5H3.5zM11 11h5.5v5.5H11z",
  people: "M10 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 16.5c0-2.8 2.7-5 6-5s6 2.2 6 5",
  levels: "M3.5 16.5h4v-4h4v-4h4v-4h1",
  builder: "M4 6h7m4 0h1M4 10h2m4 0h6M4 14h8m4 0h0M13 4.5v3M8 8.5v3M14 12.5v3",
};

function navItems(user: User): NavItem[] {
  const ownForm: NavItem[] = isEmployee(user)
    ? [{ href: `/evaluate/${user.id}`, label: "แบบประเมินของฉัน", icon: ICONS.form }]
    : [];
  if (user.role === "admin") {
    return [
      { href: "/admin/dashboard", label: "Dashboard", icon: ICONS.dashboard },
      { href: "/admin/employees", label: "ข้อมูลพนักงาน", icon: ICONS.people },
      { href: "/admin/levels", label: "ฝ่ายและ Level", icon: ICONS.levels },
      { href: "/admin/forms", label: "Form Builder", icon: ICONS.builder },
      ...ownForm,
    ];
  }
  if (user.role === "supervisor") {
    return [{ href: "/team", label: "ทีมของฉัน", icon: ICONS.team }, ...ownForm];
  }
  return ownForm;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
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

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="z-30 flex flex-col border-b border-black/10 bg-white/80 backdrop-blur-xl print:hidden lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-b-0 lg:border-r">
        <div className="px-5 pb-2 pt-5 lg:pb-6 lg:pt-7">
          <div className="text-[15px] font-semibold tracking-tight text-ink">{COMPANY_NAME}</div>
          <div className="text-xs text-faint">Performance Appraisal · {cycleLabel()}</div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:pb-0">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-accent font-medium text-white"
                    : "text-ink hover:bg-black/5"
                }`}
              >
                <svg
                  viewBox="0 0 20 20"
                  className="h-[18px] w-[18px] shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={item.icon} />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center justify-between gap-3 border-t border-black/5 px-5 py-3 lg:flex-col lg:items-stretch lg:py-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink">{user.name}</div>
            <div className="truncate text-xs text-faint">
              {ROLE_NAMES[user.role]} · รหัส {user.code}
            </div>
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
