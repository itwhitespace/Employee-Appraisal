import { compensationOverview } from "@/lib/server/compensation";
import { logCompensation, payTablesOf } from "@/lib/server/db";
import { handle, requireCompensationUser } from "@/lib/server/http";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

/** Every appraised employee with their pay, salary grade and approved Performance Score. */
export async function GET() {
  return handle(async () => {
    const user = await requireCompensationUser();
    const pay = payTablesOf(user);
    await logCompensation(pay, user.id, "เปิดดูเมนู ฐานเงินเดือนพนักงาน");
    return compensationOverview(pay);
  });
}
