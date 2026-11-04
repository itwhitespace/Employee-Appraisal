import { handle, HttpError, readJson, requireUser } from "@/lib/server/http";
import { listHardware, parseHardware, saveHardware } from "@/lib/server/it-budget";

export const dynamic = "force-dynamic";

function yearOf(value: unknown): number {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new HttpError(400, "ปีงบประมาณไม่ถูกต้อง");
  return year;
}

/** `?year=2026`: the hardware lines of Oct 2026 – Sep 2027. Admin (IT) only. */
export async function GET(request: Request) {
  return handle(async () => {
    await requireUser(["admin"]);
    const year = yearOf(new URL(request.url).searchParams.get("year"));
    return { hardware: await listHardware(year) };
  });
}

/** Body: `{ year, hardware: [{ item, detail, amounts: { "yyyy-mm": baht } }] }`: the whole year. */
export async function PUT(request: Request) {
  return handle(async () => {
    const user = await requireUser(["admin"]);
    const body = await readJson(request);
    const year = yearOf(body.year);
    await saveHardware(year, parseHardware(body.hardware, year), user.id);
    return { hardware: await listHardware(year) };
  });
}
