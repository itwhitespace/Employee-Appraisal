import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Passwords are kept as scrypt hashes, "scrypt$<salt hex>$<hash hex>", so the
 * database never holds the password itself and nobody can read it back.
 */
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, KEY_LENGTH).toString("hex")}`;
}

/** False for a wrong password and for an account that has no password yet. */
export function verifyPassword(password: string, stored: string | null): boolean {
  const [scheme, salt, hash] = (stored ?? "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== KEY_LENGTH) return false;
  return timingSafeEqual(scryptSync(password, salt, KEY_LENGTH), expected);
}
