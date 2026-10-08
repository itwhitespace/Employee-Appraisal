import { isEmployee } from "@/lib/evaluation";
import { getTemplates, listEvaluations, listUsers } from "@/lib/server/db";
import { handle, requireUser } from "@/lib/server/http";
import type { OverviewData } from "@/lib/types";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

/** Admin gets everyone; a supervisor gets themselves and their direct reports. */
export async function GET() {
  return handle(async (): Promise<OverviewData> => {
    const viewer = await requireUser(["admin", "supervisor"]);
    const [allUsers, templates] = await Promise.all([listUsers(), getTemplates()]);

    if (viewer.role === "admin") {
      return { users: allUsers, templates, evaluations: await listEvaluations() };
    }

    const reports = allUsers.filter((u) => u.supervisorId === viewer.id && isEmployee(u));
    return {
      users: [viewer, ...reports],
      templates,
      evaluations: await listEvaluations(reports.map((u) => u.id)),
    };
  });
}
