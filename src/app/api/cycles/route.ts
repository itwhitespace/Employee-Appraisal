import {
  addCycle,
  editCycle,
  listCyclesWithCounts,
  removeCycle,
  switchCycle,
} from "@/lib/server/cycles";
import { handle, HttpError, readJson, requireUser } from "@/lib/server/http";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function idOf(body: Record<string, unknown>): string {
  const id = text(body.id, 40);
  if (!id) throw new HttpError(400, "กรุณากรอกชื่อรอบประเมิน");
  return id;
}

export async function GET() {
  return handle(async () => {
    await requireUser(["admin"]);
    return { cycles: await listCyclesWithCounts() };
  });
}

/** Body: `{ id, period }`. The new cycle is not opened until it is made current. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireUser(["admin"]);
    const body = await readJson(request);
    await addCycle(idOf(body), text(body.period, 80));
    return { ok: true };
  });
}

/** Body: `{ id, period }` to edit the period, or `{ id, makeCurrent: true }` to open the cycle. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireUser(["admin"]);
    const body = await readJson(request);
    if (body.makeCurrent === true) await switchCycle(idOf(body));
    else await editCycle(idOf(body), text(body.period, 80));
    return { ok: true };
  });
}

/** Body: `{ id }`. */
export async function DELETE(request: Request) {
  return handle(async () => {
    await requireUser(["admin"]);
    await removeCycle(idOf(await readJson(request)));
    return { ok: true };
  });
}
