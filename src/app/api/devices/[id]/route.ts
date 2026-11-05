import {
  deleteDevice,
  listDevices,
  listPrograms,
  parseDeviceInput,
  setAgentStatus,
  updateDevice,
} from "@/lib/server/devices";
import { handle, HttpError, readJson, requireUser } from "@/lib/server/http";

export const dynamic = "force-dynamic";

interface Context {
  params: { id: string };
}

/** The programs installed on one computer, from its last list. */
export async function GET(_request: Request, { params }: Context) {
  return handle(async () => {
    await requireUser(["admin"]);
    return { programs: await listPrograms(params.id) };
  });
}

/** Body: `{ device, approve? }`: the register part; `approve` accepts a computer that is waiting. */
export async function PUT(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await requireUser(["admin"]);
    const body = await readJson(request);
    const raw =
      body.device && typeof body.device === "object" ? (body.device as Record<string, unknown>) : {};
    await updateDevice(params.id, parseDeviceInput(raw), user.id, body.approve === true);
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

export async function DELETE(_request: Request, { params }: Context) {
  return handle(async () => {
    await requireUser(["admin"]);
    await deleteDevice(params.id);
    return { devices: await listDevices() };
  });
}
