import "server-only";
import { HttpError } from "@/lib/server/errors";

/** A report's JSON body, at most 2 MB (a long program list is a few hundred KB). */
export async function readAgentJson(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 2_000_000) throw new HttpError(413, "ข้อมูลใหญ่เกินไป");
  let body: unknown;
  try {
    body = JSON.parse(raw.replace(/^﻿/, ""));
  } catch {
    throw new HttpError(400, "ข้อมูลที่ส่งมาไม่ถูกต้อง");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new HttpError(400, "ข้อมูลที่ส่งมาไม่ถูกต้อง");
  return body as Record<string, unknown>;
}
