import { createUser } from "@/lib/server/db";
import { handle, readJson, requireUser } from "@/lib/server/http";
import { parseEmployeeInput } from "@/lib/server/validate";

export async function POST(request: Request) {
  return handle(async () => {
    await requireUser(["admin"]);
    return { user: await createUser(parseEmployeeInput(await readJson(request))) };
  });
}
