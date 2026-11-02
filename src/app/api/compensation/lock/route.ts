import {
  countRecentActions,
  getCompensationPasswordHash,
  getLoginRecord,
  logCompensation,
  setCompensationPasswordHash,
} from "@/lib/server/db";
import { handle, HttpError, readJson, requireCompensationAccess } from "@/lib/server/http";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { isCompensationUnlocked, lockCompensation, unlockCompensation } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const WRONG = "ใส่รหัสผ่านค่าตอบแทนไม่ถูกต้อง";
const MAX_TRIES = 5;
const WINDOW_MINUTES = 15;

/** Whether the compensation password has been set, and whether the pages are open now. */
export async function GET() {
  return handle(async () => {
    const user = await requireCompensationAccess();
    return {
      hasPassword: (await getCompensationPasswordHash(user.id)) !== null,
      unlocked: isCompensationUnlocked(user.id),
    };
  });
}

/**
 * Body, one of:
 *   { action: "unlock", password }
 *   { action: "setup", loginPassword, newPassword }   the first time, when none is set
 *   { action: "change", currentPassword, newPassword }
 *   { action: "lock" }
 * Five wrong passwords within 15 minutes block further tries for a while; every try is logged.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireCompensationAccess();
    const body = await readJson(request);
    const text = (value: unknown) => (typeof value === "string" ? value : "");

    if (body.action === "lock") {
      lockCompensation();
      await logCompensation(user.id, "ล็อกเมนูค่าตอบแทน");
      return { ok: true };
    }

    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    if ((await countRecentActions(user.id, WRONG, since)) >= MAX_TRIES) {
      throw new HttpError(429, `ใส่รหัสผ่านผิดหลายครั้ง กรุณารอ ${WINDOW_MINUTES} นาทีแล้วลองใหม่`);
    }
    const stored = await getCompensationPasswordHash(user.id);
    const refuse = async (detail: string) => {
      await logCompensation(user.id, `${WRONG} (${detail})`);
      throw new HttpError(401, "รหัสผ่านไม่ถูกต้อง");
    };
    const checkNew = (password: string) => {
      if (password.length < 8) throw new HttpError(400, "รหัสผ่านค่าตอบแทนต้องยาวอย่างน้อย 8 ตัวอักษร");
      if (/^\d+$/.test(password))
        throw new HttpError(400, "รหัสผ่านค่าตอบแทนต้องมีตัวอักษร ไม่ใช่ตัวเลขอย่างเดียว");
    };

    if (body.action === "unlock") {
      if (!stored) throw new HttpError(409, "ยังไม่ได้ตั้งรหัสผ่านค่าตอบแทน");
      if (!verifyPassword(text(body.password), stored)) await refuse("ปลดล็อก");
      unlockCompensation(user.id);
      await logCompensation(user.id, "ปลดล็อกเมนูค่าตอบแทน");
      return { ok: true };
    }

    if (body.action === "setup") {
      if (stored) throw new HttpError(409, "ตั้งรหัสผ่านค่าตอบแทนไว้แล้ว");
      const login = await getLoginRecord(user.code);
      if (!verifyPassword(text(body.loginPassword), login?.passwordHash ?? null))
        await refuse("ตั้งรหัสครั้งแรก");
      const password = text(body.newPassword);
      checkNew(password);
      if (verifyPassword(password, login?.passwordHash ?? null)) {
        throw new HttpError(400, "รหัสผ่านค่าตอบแทนต้องไม่ซ้ำกับรหัสเข้าระบบ");
      }
      await setCompensationPasswordHash(user.id, hashPassword(password));
      unlockCompensation(user.id);
      await logCompensation(user.id, "ตั้งรหัสผ่านค่าตอบแทน");
      return { ok: true };
    }

    if (body.action === "change") {
      if (!stored || !verifyPassword(text(body.currentPassword), stored)) await refuse("เปลี่ยนรหัส");
      const password = text(body.newPassword);
      checkNew(password);
      await setCompensationPasswordHash(user.id, hashPassword(password));
      unlockCompensation(user.id);
      await logCompensation(user.id, "เปลี่ยนรหัสผ่านค่าตอบแทน");
      return { ok: true };
    }

    throw new HttpError(400, "ไม่รู้จักคำสั่งนี้");
  });
}
