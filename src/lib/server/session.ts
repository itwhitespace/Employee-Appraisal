import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { User } from "../types";
import { getUser } from "./db";

/**
 * Login session: an HMAC-signed cookie holding the user id and expiry.
 * The user is re-read from the database on every request, so a changed role
 * or a deleted account takes effect immediately.
 */
const COOKIE = "wsp_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function sign(payload: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing SESSION_SECRET in .env.local");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function startSession(userId: string): void {
  const payload = `${userId}.${Date.now() + MAX_AGE_SECONDS * 1000}`;
  cookies().set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function endSession(): void {
  cookies().delete(COOKIE);
}

export async function getSessionUser(): Promise<User | null> {
  const value = cookies().get(COOKIE)?.value;
  if (!value) return null;

  const cut = value.lastIndexOf(".");
  const payload = value.slice(0, cut);
  const given = Buffer.from(value.slice(cut + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const [userId, expires] = payload.split(".");
  if (!userId || Number(expires) < Date.now()) return null;
  return getUser(userId);
}
