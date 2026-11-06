import {
  addHolding,
  deleteDevice,
  deleteHolding,
  listDevices,
  listChanges,
  listHoldings,
  listPrograms,
  parseDeviceInput,
  parseHandover,
  parseHoldingInput,
  setAgentStatus,
  updateDevice,
} from "@/lib/server/devices";
import { handle, HttpError, readJson, requireUser } from "@/lib/server/http";

export const dynamic = "force-dynamic";

interface Context {
  params: { id: string };
}

/** One computer's holders over time, what changed on it, and the programs from its last list. */
export async function GET(_request: Request, { params }: Context) {
  return handle(async () => {
    await requireUser(["admin"]);
    const [history, changes, programs] = await Promise.all([
      listHoldings(params.id),
      listChanges(params.id),
      listPrograms(params.id),
    ]);
    return { history, changes, programs };
  });
}

/**
 * Body: `{ device, approve?, handover? }`: the register part; `approve` accepts a computer that is
 * waiting; `handover` = `{ date, note }` for the history when the holder changes.
 */
export async function PUT(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await requireUser(["admin"]);
    const body = await readJson(request);
    const raw =
      body.device && typeof body.device === "object" ? (body.device as Record<string, unknown>) : {};
    await updateDevice(
      params.id,
      parseDeviceInput(raw),
      user.id,
      body.approve === true,
      parseHandover(body.handover),
    );
    return { devices: await listDevices() };
  });
}

/** Body: `{ agentStatus: "blocked" | "approved" }`: refuse the computer's reports, or accept them again. */
export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await requireUser(["admin"]);
    const body = await readJson(request);
    if (body.agentStatus !== "blocked" && body.agentStatus !== "approved") {
      throw new HttpError(400, "สถานะไม่ถูกต้อง");
    }
    await setAgentStatus(params.id, body.agentStatus, user.id);
    return { devices: await listDevices() };
  });
}

/** Body: `{ holding }`: a line of the holder history typed in by hand. */
export async function POST(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await requireUser(["admin"]);
    const body = await readJson(request);
    const raw =
      body.holding && typeof body.holding === "object" ? (body.holding as Record<string, unknown>) : {};
    await addHolding(params.id, parseHoldingInput(raw), user.id);
    return { history: await listHoldings(params.id) };
  });
}

/** `?history=<id>` removes one line of the holder history; otherwise the whole computer. */
export async function DELETE(request: Request, { params }: Context) {
  return handle(async () => {
    await requireUser(["admin"]);
    const holding = new URL(request.url).searchParams.get("history");
    if (holding) {
      await deleteHolding(params.id, holding);
      return { history: await listHoldings(params.id) };
    }
    await deleteDevice(params.id);
    return { devices: await listDevices() };
  });
}
