import { deleteLevel, saveLevel } from "@/lib/server/db";
import { handle, readJson, requireUser } from "@/lib/server/http";
import { parseJobLevel } from "@/lib/server/validate";

/** Add a level, or rename an existing one. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireUser(["admin"]);
    return { level: await saveLevel(parseJobLevel(await readJson(request))) };
  });
}

/** Body: `{ departmentId, level }`. */
export async function DELETE(request: Request) {
  return handle(async () => {
    await requireUser(["admin"]);
    // The name is not needed to delete; the placeholder only satisfies the parser.
    const { departmentId, level } = parseJobLevel({ ...(await readJson(request)), name: "-" });
    await deleteLevel(departmentId, level);
    return { ok: true };
  });
}
