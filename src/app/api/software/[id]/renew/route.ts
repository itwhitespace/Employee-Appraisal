import { handle, HttpError, readJson, requireUser } from "@/lib/server/http";
import { listLicenses, parseLicenseAmount, parseLicenseDate, renewLicense } from "@/lib/server/software";

export const dynamic = "force-dynamic";

interface Context {
  params: { id: string };
}

/** Body: `{ startDate, expireDate, pricePerYear?, seats?, note? }`: the new term. */
export async function POST(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await requireUser(["admin"]);
    const body = await readJson(request);
    const startDate = parseLicenseDate(body.startDate, "วันเริ่ม");
    const expireDate = parseLicenseDate(body.expireDate, "วันหมดอายุ");
    if (startDate && expireDate && expireDate < startDate) {
      throw new HttpError(400, "วันหมดอายุต้องไม่ก่อนวันเริ่ม");
    }
    const seats = parseLicenseAmount(body.seats, "จำนวน Seat");
    await renewLicense(
      params.id,
      {
        startDate,
        expireDate,
        pricePerYear: parseLicenseAmount(body.pricePerYear, "ราคาต่อปี"),
        seats: seats === null ? null : Math.round(seats),
        note: typeof body.note === "string" ? body.note.trim().slice(0, 300) : "",
      },
      user.id,
    );
    return { licenses: await listLicenses() };
  });
}
