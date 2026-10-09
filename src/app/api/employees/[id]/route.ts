import { deleteUser, updateUser } from "@/lib/server/db";
import { handle, HttpError, readJson, requireUser } from "@/lib/server/http";
import { hashPassword } from "@/lib/server/password";
import { parseEmployeeInput, parsePassword } from "@/lib/server/validate";

interface Context {
  params: { id: string };
}

export async function PUT(request: Request, { params }: Context) {
  return handle(async () => {
    const admin = await requireUser(["admin"]);
    const body = await readJson(request);
    const input = parseEmployeeInput(body);
    const password = parsePassword(body);
    if (input.supervisorId === params.id) {
      throw new HttpError(400, "พนักงานเป็นผู้ประเมินของตัวเองไม่ได้");
    }
    if (params.id === admin.id && input.role !== "admin") {
      throw new HttpError(400, "ไม่สามารถถอดสิทธิ์ Admin ของตัวเองได้");
    }
    return {
      user: await updateUser(params.id, input, password ? hashPassword(password) : null),
    };
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  return handle(async () => {
    const admin = await requireUser(["admin"]);
    if (params.id === admin.id) throw new HttpError(400, "ไม่สามารถลบบัญชีของตัวเองได้");
    await deleteUser(params.id);
    return { ok: true };
  });
}
