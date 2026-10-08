import { getUserByCode } from "@/lib/server/db";
import { handle, HttpError, readJson } from "@/lib/server/http";
import { startSession } from "@/lib/server/session";

/** Sign in with the 5-digit employee code. */
export async function POST(request: Request) {
  return handle(async () => {
    const { code } = await readJson(request);
    if (typeof code !== "string" || !/^\d{5}$/.test(code)) {
      throw new HttpError(400, "กรุณากรอกรหัสพนักงาน 5 หลัก");
    }
    const user = await getUserByCode(code);
    if (!user) throw new HttpError(401, "ไม่พบรหัสพนักงานนี้ในระบบ");
    startSession(user.id);
    return { user };
  });
}
