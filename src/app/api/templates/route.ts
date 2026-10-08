import { getTemplates, listLevels, saveTemplate } from "@/lib/server/db";
import { handle, readJson, requireUser } from "@/lib/server/http";
import { parseTemplate } from "@/lib/server/validate";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireUser(["admin"]);
    const levels = await listLevels();
    return { levels, templates: await getTemplates(levels) };
  });
}

/** Save one Department x Level template. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireUser(["admin"]);
    const template = parseTemplate(await readJson(request));
    return { template: await saveTemplate(template) };
  });
}
