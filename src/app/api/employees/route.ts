import { createUser } from "@/lib/server/db";
import { handle, HttpError, readJson, requireUser } from "@/lib/server/http";
import { hashPassword } from "@/lib/server/password";
import { parseEmployeeInput, parsePassword } from "@/lib/server/validate";

export async function POST(request: Request) {
  return handle(async () => {
    await requireUser(["admin"]);
    const body = await readJson(request);
    const input = parseEmployeeInput(body);
    const password = parsePassword(body);
    if (!password) throw new HttpError(400, "กรุณากำหนดรหัสผ่าน");
    return { user: await createUser(input, hashPassword(password)) };
  });
}
