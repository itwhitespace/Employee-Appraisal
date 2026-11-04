import { handle, HttpError, readJson, requireUser } from "@/lib/server/http";
import { createLicenses, listLicenses, parseLicenseInput } from "@/lib/server/software";

export const dynamic = "force-dynamic";

/** Every software license. Admin (IT) only. */
export async function GET() {
  return handle(async () => {
    await requireUser(["admin"]);
    return { licenses: await listLicenses() };
  });
}

/**
 * Body: `{ license }` to add one, or `{ licenses: [...] }` to add many (the Excel import).
 * Every one is checked before any is saved.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(["admin"]);
    const body = await readJson(request);
    const raw = Array.isArray(body.licenses) ? body.licenses : body.license ? [body.license] : [];
    if (raw.length === 0) throw new HttpError(400, "ไม่มีรายการที่จะบันทึก");
    if (raw.length > 500) throw new HttpError(400, "นำเข้าได้ครั้งละไม่เกิน 500 รายการ");
    const inputs = raw.map((item, i) => {
      try {
        return parseLicenseInput(item && typeof item === "object" ? (item as Record<string, unknown>) : {});
      } catch (e) {
        throw raw.length > 1 && e instanceof HttpError
          ? new HttpError(400, `รายการที่ ${i + 1}: ${e.message}`)
          : e;
      }
    });
    const created = await createLicenses(inputs, user.id);
    return { created, licenses: await listLicenses() };
  });
}
