import { isEmployee } from "@/lib/evaluation";
import { resolveCycle } from "@/lib/server/cycles";
import { getTemplates, listEvaluations, listLevels, listUsers } from "@/lib/server/db";
import { handle, requireUser } from "@/lib/server/http";
import type { OverviewData } from "@/lib/types";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

/**
 * Admin gets everyone; a supervisor gets themselves and their direct reports.
 * `?cycle=` reads a past cycle; without it, the current one.
 */
export async function GET(request: Request) {
  return handle(async (): Promise<OverviewData> => {
    const viewer = await requireUser(["admin", "supervisor"]);
    const [allUsers, levels, { cycle, cycles }] = await Promise.all([
      listUsers(),
      listLevels(),
      resolveCycle(new URL(request.url).searchParams.get("cycle")),
    ]);
    const templates = await getTemplates(levels);
    const shared = { cycle, cycles, levels, templates };

    if (viewer.role === "admin") {
      return { ...shared, users: allUsers, evaluations: await listEvaluations(cycle.id) };
    }

    if (cycle.current) {
      const reports = allUsers.filter((u) => u.supervisorId === viewer.id && isEmployee(u));
      return {
        ...shared,
        users: [viewer, ...reports],
        evaluations: await listEvaluations(cycle.id, reports.map((u) => u.id)),
      };
    }

    // History: the people this viewer appraised then, plus their reports of today.
    const all = await listEvaluations(cycle.id);
    const reports = allUsers.filter(
      (u) =>
        all[u.id] &&
        (all[u.id].snapshot?.employee.supervisorId === viewer.id || u.supervisorId === viewer.id),
    );
    return {
      ...shared,
      users: [viewer, ...reports],
      evaluations: Object.fromEntries(reports.map((u) => [u.id, all[u.id]])),
    };
  });
}
