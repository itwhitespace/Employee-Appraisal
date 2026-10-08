import "server-only";
import { NextResponse } from "next/server";
import type { Role, User } from "../types";
import { HttpError } from "./errors";
import { getSessionUser } from "./session";

export { HttpError };

/** Runs a route handler, turning thrown errors into JSON `{ error }` responses. */
export async function handle(fn: () => Promise<unknown>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

/** The signed-in user, or a 401 / 403 when missing or not in one of `roles`. */
export async function requireUser(roles?: Role[]): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
  if (roles && !roles.includes(user.role)) throw new HttpError(403, "คุณไม่มีสิทธิ์ใช้งานส่วนนี้");
  return user;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "ข้อมูลที่ส่งมาไม่ถูกต้อง");
  }
  return body as Record<string, unknown>;
}
