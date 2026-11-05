import {
  createDevice,
  enrollKey,
  listDevices,
  listHolders,
  parseDeviceInput,
  parseHandover,
} from "@/lib/server/devices";
import { handle, readJson, requireUser } from "@/lib/server/http";
import { AGENT_VERSION } from "@/lib/server/installer";

export const dynamic = "force-dynamic";

/** The computer register, the people to give computers to, and whether install.cmd can be made. */
export async function GET() {
  return handle(async () => {
    await requireUser(["admin"]);
    const [devices, holders] = await Promise.all([listDevices(), listHolders()]);
    return { devices, holders, installerReady: enrollKey() !== null, agentVersion: AGENT_VERSION };
  });
}

/** Body: `{ device, handover? }`: a computer without the agent. */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(["admin"]);
    const body = await readJson(request);
    const raw =
      body.device && typeof body.device === "object" ? (body.device as Record<string, unknown>) : {};
    await createDevice(parseDeviceInput(raw), user.id, parseHandover(body.handover));
    return { devices: await listDevices() };
  });
}
