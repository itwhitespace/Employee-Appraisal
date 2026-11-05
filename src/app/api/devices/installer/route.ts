import { enrollKey } from "@/lib/server/devices";
import { errorResponse, HttpError, requireUser } from "@/lib/server/http";
import { installCmd, uninstallCmd } from "@/lib/server/installer";

export const dynamic = "force-dynamic";

/**
 * `?file=install` or `?file=uninstall`: the Windows agent's install.cmd (with this site's address
 * and the enrolment key) or uninstall.cmd. Admin only, since install.cmd holds the key.
 */
export async function GET(request: Request) {
  try {
    await requireUser(["admin"]);
    const url = new URL(request.url);
    const file = url.searchParams.get("file");
    let body: string;
    if (file === "uninstall") {
      body = uninstallCmd();
    } else if (file === "install") {
      const key = enrollKey();
      if (!key) throw new HttpError(503, "ยังไม่ได้ตั้งค่า DEVICE_ENROLL_KEY ใน Vercel");
      body = installCmd(url.origin, key);
    } else {
      throw new HttpError(400, "ไม่รู้จักไฟล์นี้");
    }
    return new Response(body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file}.cmd"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
