import { loadEvaluation, updateEvaluation } from "@/lib/server/evaluations";
import { handle, readJson, requireUser } from "@/lib/server/http";
import type { EvaluationAction } from "@/lib/types";

interface Context {
  params: { employeeId: string };
}

export async function GET(_request: Request, { params }: Context) {
  return handle(async () => loadEvaluation(await requireUser(), params.employeeId));
}

/** Body: `{ evaluation, action }`. The server keeps only the fields the caller may change. */
export async function PUT(request: Request, { params }: Context) {
  return handle(async () => {
    const viewer = await requireUser();
    const body = await readJson(request);
    const evaluation = (body.evaluation ?? {}) as Record<string, unknown>;
    return updateEvaluation(viewer, params.employeeId, evaluation, body.action as EvaluationAction);
  });
}
