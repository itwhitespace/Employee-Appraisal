import { cookies } from "next/headers";
import { loadEvaluation } from "@/lib/server/evaluations";
import { errorResponse, HttpError, requireUser } from "@/lib/server/http";
import { renderPagePdf } from "@/lib/server/pdf";
import { SESSION_COOKIE } from "@/lib/server/session";

// Headless Chromium needs the Node.js runtime and more time than an ordinary request.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Context {
  params: { employeeId: string };
}

/** A confirmed form as PDF, for its appraiser and admin. `?cycle=` for a past cycle. */
export async function GET(request: Request, { params }: Context) {
  try {
    const viewer = await requireUser(["admin", "supervisor"]);
    const cycleId = new URL(request.url).searchParams.get("cycle");
    const bundle = await loadEvaluation(viewer, params.employeeId, cycleId);
    if (viewer.role !== "admin" && viewer.id !== bundle.employee.supervisorId) {
      throw new HttpError(403, "คุณไม่มีสิทธิ์ดาวน์โหลดแบบประเมินนี้");
    }
    if (bundle.evaluation.status !== "completed" && bundle.evaluation.status !== "approved") {
      throw new HttpError(409, "ดาวน์โหลด PDF ได้เฉพาะแบบประเมินที่เสร็จสิ้นแล้ว");
    }

    const session = cookies().get(SESSION_COOKIE);
    if (!session) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
    const page = new URL(`/evaluate/${bundle.employee.id}`, request.url);
    if (cycleId) page.searchParams.set("cycle", cycleId);

    const pdf = await renderPagePdf(page.toString(), session);
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
