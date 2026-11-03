import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { HttpError } from "./errors";

/**
 * Pay figures are stored encrypted, so they cannot be read in the Supabase dashboard or in a
 * copy of the database: AES-256-GCM with the key in COMPENSATION_KEY (32 bytes, base64), which
 * lives in Vercel and in the hands of the MD, never in the database or in git.
 *
 * Stored as "v1:" + base64(iv · tag · ciphertext). Each value is bound to its place (`context`,
 * e.g. the employee and date): moved to another row, it no longer decrypts. The handover
 * scripts (handover/scripts/common.mjs) read and write the same format.
 */

const VERSION = "v1";

function key(): Buffer {
  const text = process.env.COMPENSATION_KEY ?? "";
  const bytes = Buffer.from(text, "base64");
  if (bytes.length !== 32) {
    throw new HttpError(
      500,
      "ยังไม่ได้ตั้งกุญแจเข้ารหัสเงินเดือน (COMPENSATION_KEY) หรือกุญแจไม่ถูกต้อง แจ้ง IT",
    );
  }
  return bytes;
}

export function encryptJson(value: unknown, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

export function decryptJson<T>(stored: string, context: string): T {
  const [version, data] = stored.split(":");
  if (version !== VERSION || !data) throw new HttpError(500, "ข้อมูลเงินเดือนที่เข้ารหัสไว้ไม่ถูกต้อง");
  const bytes = Buffer.from(data, "base64");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"),
    );
  } catch {
    // A wrong key, or a value changed or moved by hand.
    throw new HttpError(500, "ถอดรหัสข้อมูลเงินเดือนไม่ได้ (กุญแจไม่ตรงหรือข้อมูลถูกแก้) แจ้ง IT");
  }
}

/** Where a salary record belongs: its table, employee and date. */
export const salaryContext = (table: string, employeeId: string, effectiveDate: string) =>
  `${table}:${employeeId}:${effectiveDate}`;

/** Where a plan belongs: its table and cycle. */
export const planContext = (table: string, cycleId: string) => `${table}:${cycleId}`;
