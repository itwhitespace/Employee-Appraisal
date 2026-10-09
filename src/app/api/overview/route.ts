import { isEmployee } from "@/lib/evaluation";
import { resolveCycle } from "@/lib/server/cycles";
import { getScales, getTemplates, listEvaluations, listLevels, listUsers } from "@/lib/server/db";
import { handle, requireUser } from "@/lib/server/http";
import type { Evaluation, OverviewData } from "@/lib/types";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

/**
 * Admin gets everyone; a supervisor gets themselves and their direct reports.
 * `?cycle=` reads a past cycle; without it, the current one.
 */
export async function GET(request: Request) {
  return handle(async (): Promise<OverviewData> => {
    const viewer = await requireUser(["admin", "supervisor"]);
    const [allUsers, levels, liveScales, { cycle, cycles }] = await Promise.all([
      listUsers(),
      listLevels(),
      getScales(),
      resolveCycle(new URL(request.url).searchParams.get("cycle")),
    ]);
    const templates = await getTemplates(levels);
    // A closed cycle keeps the scales its forms were frozen with.
    const scalesOf = (evaluations: Record<string, Evaluation>) =>
      (cycle.current
        ? undefined
        : Object.values(evaluations).find((e) => e.snapshot?.scales)?.snapshot?.scales) ?? liveScales;
    const shared = { cycle, cycles, levels, templates };

    if (viewer.role === "admin") {
      const evaluations = await listEvaluations(cycle.id);
      return { ...shared, scales: scalesOf(evaluations), users: allUsers, evaluations };
    }

    if (cycle.current) {
      const reports = allUsers.filter((u) => u.supervisorId === viewer.id && isEmployee(u));
      return {
        ...shared,
        scales: liveScales,
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
      scales: scalesOf(all),
      users: [viewer, ...reports],
      evaluations: Object.fromEntries(reports.map((u) => [u.id, all[u.id]])),
    };
  });
}
