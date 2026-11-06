import { enrollKey } from "@/lib/server/devices";
import { errorResponse, HttpError, requireUser } from "@/lib/server/http";
import {
  AGENT_VERSION,
  installCmd,
  installMac,
  MAC_AGENT_VERSION,
  uninstallCmd,
  uninstallMac,
} from "@/lib/server/installer";

export const dynamic = "force-dynamic";

/**
 * `?file=install | uninstall | install-mac | uninstall-mac`: the Windows agent's install.cmd (with this site's address
 * and the enrolment key) or uninstall.cmd. Admin only, since install.cmd holds the key.
 */
export async function GET(request: Request) {
  try {
    await requireUser(["admin"]);
    const url = new URL(request.url);
    const file = url.searchParams.get("file");
    const ver = (v: string) => v.replace(/\./g, "_");
    const needKey = () => {
      const key = enrollKey();
      if (!key) throw new HttpError(503, "ยังไม่ได้ตั้งค่า DEVICE_ENROLL_KEY ใน Vercel");
      return key;
    };
    // The file name says which agent version it installs: install_agent_1_0_3.cmd.
    let body: string;
    let name: string;
    if (file === "uninstall") {
      [body, name] = [uninstallCmd(), "uninstall_agent.cmd"];
    } else if (file === "install") {
      [body, name] = [installCmd(url.origin, needKey()), `install_agent_${ver(AGENT_VERSION)}.cmd`];
    } else if (file === "install-mac") {
      [body, name] = [installMac(url.origin, needKey()), `install_agent_mac_${ver(MAC_AGENT_VERSION)}.sh`];
    } else if (file === "uninstall-mac") {
      [body, name] = [uninstallMac(), "uninstall_agent_mac.sh"];
    } else {
      throw new HttpError(400, "ไม่รู้จักไฟล์นี้");
    }
    return new Response(body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
