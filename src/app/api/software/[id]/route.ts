import { handle, readJson, requireUser } from "@/lib/server/http";
import {
  deleteLicense,
  listLicenses,
  listRenewals,
  parseLicenseInput,
  updateLicense,
} from "@/lib/server/software";

export const dynamic = "force-dynamic";

interface Context {
  params: { id: string };
}

/** The renewal history of one license, newest first. */
export async function GET(_request: Request, { params }: Context) {
  return handle(async () => {
    await requireUser(["admin"]);
    return { renewals: await listRenewals(params.id) };
  });
}

/** Body: `{ license }`, the whole license. */
export async function PUT(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await requireUser(["admin"]);
    const body = await readJson(request);
    const raw =
      body.license && typeof body.license === "object" ? (body.license as Record<string, unknown>) : {};
    await updateLicense(params.id, parseLicenseInput(raw), user.id);
    return { licenses: await listLicenses() };
  });
}

/** Removes the license and its renewal history. */
export async function DELETE(_request: Request, { params }: Context) {
  return handle(async () => {
    await requireUser(["admin"]);
    await deleteLicense(params.id);
    return { licenses: await listLicenses() };
  });
}
