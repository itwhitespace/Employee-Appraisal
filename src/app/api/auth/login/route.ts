import { getLoginRecord } from "@/lib/server/db";
import { handle, HttpError, readJson } from "@/lib/server/http";
import { verifyPassword } from "@/lib/server/password";
import { startSession } from "@/lib/server/session";

/** Sign in with the 5-digit employee code and the password. */
export async function POST(request: Request) {
  return handle(async () => {
    const { code, password } = await readJson(request);
    if (typeof code !== "string" || !/^\d{5}$/.test(code)) {
      throw new HttpError(400, "กรุณากรอกรหัสพนักงาน 5 หลัก");
    }
    if (typeof password !== "string" || !password) {
      throw new HttpError(400, "กรุณากรอกรหัสผ่าน");
    }
    const record = await getLoginRecord(code);
    // One message for both cases, so a wrong guess does not reveal which codes exist.
    if (!record || !verifyPassword(password, record.passwordHash)) {
      throw new HttpError(401, "รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง");
    }
    startSession(record.user.id);
    return { user: record.user };
  });
}
