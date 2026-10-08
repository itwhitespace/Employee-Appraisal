import type { Employee, User } from "./types";

/** Access rules shared by the browser (navigation) and the server (enforcement). */

/** Landing page of each role after sign-in. */
export function homePath(user: User): string {
  if (user.role === "admin") return "/admin/dashboard";
  if (user.role === "supervisor") return "/team";
  return `/evaluate/${user.id}`;
}

/** Page-level access. Per-employee access to a form is checked by canViewEvaluation. */
export function canAccessPath(user: User, pathname: string): boolean {
  if (pathname.startsWith("/admin")) return user.role === "admin";
  if (pathname.startsWith("/team")) return user.role === "supervisor";
  return true;
}

/** A form is visible to its owner, the owner's supervisor, and admin. */
export function canViewEvaluation(user: User, employee: Employee): boolean {
  return user.role === "admin" || user.id === employee.id || user.id === employee.supervisorId;
}
