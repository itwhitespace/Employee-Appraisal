import "server-only";
import {
  CATEGORIES,
  type BillingCycle,
  type BudgetGroup,
  type LicenseInput,
  type LicenseRenewal,
  type LicenseStatus,
  type LicenseType,
  type PaymentMethod,
  type SoftwareLicense,
} from "../software";
import { HttpError } from "./errors";
import { db } from "./supabase";

/** Software licenses (IT Assets): stored in software_licenses, renewals in software_license_renewals. */

interface LicenseRow {
  id: string;
  name: string;
  detail: string;
  category: string;
  license_type: LicenseType;
  billing_cycle: BillingCycle;
  renew_day: number | null;
  start_date: string | null;
  expire_date: string | null;
  seats: number | null;
  unit_price: number | string | null;
  price_per_year: number | string | null;
  payment_method: PaymentMethod;
  card_label: string;
  vendor: string;
  vendor_contact: string;
  status: LicenseStatus;
  remark: string;
  budget_group?: BudgetGroup;
  updated_at: string;
}

const num = (value: number | string | null) => (value === null ? null : Number(value));

const toLicense = (row: LicenseRow): SoftwareLicense => ({
  id: row.id,
  name: row.name,
  detail: row.detail,
  category: row.category,
  licenseType: row.license_type,
  billingCycle: row.billing_cycle,
  renewDay: row.renew_day,
  startDate: row.start_date,
  expireDate: row.expire_date,
  seats: row.seats,
  unitPrice: num(row.unit_price),
  pricePerYear: num(row.price_per_year),
  paymentMethod: row.payment_method,
  cardLabel: row.card_label,
  vendor: row.vendor,
  vendorContact: row.vendor_contact,
  status: row.status,
  remark: row.remark,
  budgetGroup: row.budget_group ?? "back-office",
  updatedAt: row.updated_at,
});

const toRow = (input: LicenseInput) => ({
  name: input.name,
  detail: input.detail,
  category: input.category,
  license_type: input.licenseType,
  billing_cycle: input.billingCycle,
  renew_day: input.renewDay,
  start_date: input.startDate,
  expire_date: input.expireDate,
  seats: input.seats,
  unit_price: input.unitPrice,
  price_per_year: input.pricePerYear,
  payment_method: input.paymentMethod,
  card_label: input.cardLabel,
  vendor: input.vendor,
  vendor_contact: input.vendorContact,
  status: input.status,
  remark: input.remark,
  budget_group: input.budgetGroup,
});

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

// ---- validation

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
function dateOf(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${label}ไม่ถูกต้อง`);
  }
  return value;
}
function amountOf(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new HttpError(400, `${label}ไม่ถูกต้อง`);
  return Math.round(n * 100) / 100;
}
/** Passwords belong in a password manager, not in this list. */
const PASSWORD = /pass\s*(word|mail)?\s*[:=]|รหัสผ่าน\s*[:=]/i;

export function parseLicenseInput(body: Record<string, unknown>): LicenseInput {
  const name = text(body.name, 120);
  if (!name) throw new HttpError(400, "กรุณากรอกชื่อโปรแกรม / บริการ");
  const billingCycle = oneOf<BillingCycle>(
    body.billingCycle,
    ["monthly", "1y", "2y", "3y", "perpetual"],
    "1y",
  );
  const renewDay =
    body.renewDay === null || body.renewDay === "" || body.renewDay === undefined
      ? null
      : Number(body.renewDay);
  if (renewDay !== null && !(Number.isInteger(renewDay) && renewDay >= 1 && renewDay <= 31)) {
    throw new HttpError(400, "วันที่ตัดบัตรต้องอยู่ระหว่าง 1–31");
  }
  const seats = amountOf(body.seats, "จำนวน Seat");
  const input: LicenseInput = {
    name,
    detail: text(body.detail, 200),
    category: oneOf(body.category, CATEGORIES, "อื่น ๆ"),
    licenseType: oneOf<LicenseType>(body.licenseType, ["subscription", "perpetual"], "subscription"),
    billingCycle,
    renewDay: billingCycle === "monthly" ? renewDay : null,
    startDate: dateOf(body.startDate, "วันเริ่ม"),
    expireDate: billingCycle === "perpetual" ? null : dateOf(body.expireDate, "วันหมดอายุ"),
    seats: seats === null ? null : Math.round(seats),
    unitPrice: amountOf(body.unitPrice, "ราคาต่อหน่วย"),
    pricePerYear: amountOf(body.pricePerYear, "ราคาต่อปี"),
    paymentMethod: oneOf<PaymentMethod>(body.paymentMethod, ["", "invoice", "card", "other"], ""),
    cardLabel: text(body.cardLabel, 40),
    vendor: text(body.vendor, 120),
    vendorContact: text(body.vendorContact, 200),
    status: oneOf<LicenseStatus>(body.status, ["active", "cancelled"], "active"),
    remark: text(body.remark, 500),
    budgetGroup: oneOf<BudgetGroup>(body.budgetGroup, ["back-office", "designer"], "back-office"),
  };
  if (input.startDate && input.expireDate && input.expireDate < input.startDate) {
    throw new HttpError(400, "วันหมดอายุต้องไม่ก่อนวันเริ่ม");
  }
  if ([input.detail, input.remark, input.vendorContact].some((t) => PASSWORD.test(t))) {
    throw new HttpError(400, "อย่าเก็บรหัสผ่านในระบบนี้ ให้เก็บใน Password Manager แทน");
  }
  if (/\d{4}[\s-]?\d{4}[\s-]?\d{4}/.test(input.cardLabel)) {
    throw new HttpError(400, "ชื่อบัตรเก็บได้แค่ 4 ตัวท้าย เช่น Mastercard ••1234");
  }
  return input;
}

// ---- database

export async function listLicenses(): Promise<SoftwareLicense[]> {
  const rows = check(await db().from("software_licenses").select("*").order("name").order("expire_date"));
  return (rows as LicenseRow[]).map(toLicense);
}

export async function createLicenses(inputs: LicenseInput[], actorId: string): Promise<number> {
  if (inputs.length === 0) return 0;
  check(
    await db()
      .from("software_licenses")
      .insert(inputs.map((input) => ({ ...toRow(input), updated_by: actorId }))),
  );
  return inputs.length;
}

async function getLicense(id: string): Promise<SoftwareLicense> {
  const row = check(
    await db().from("software_licenses").select("*").eq("id", id).maybeSingle(),
  ) as LicenseRow | null;
  if (!row) throw new HttpError(404, "ไม่พบรายการนี้ กรุณาโหลดหน้าใหม่");
  return toLicense(row);
}

export async function updateLicense(id: string, input: LicenseInput, actorId: string): Promise<void> {
  await getLicense(id);
  check(
    await db()
      .from("software_licenses")
      .update({ ...toRow(input), updated_by: actorId, updated_at: new Date().toISOString() })
      .eq("id", id),
  );
}

export async function deleteLicense(id: string): Promise<void> {
  await getLicense(id);
  check(await db().from("software_licenses").delete().eq("id", id));
}

/**
 * Renews a license: the term it had is kept in the history, then the new dates (and price and
 * seats when given) replace it. A cancelled license becomes active again.
 */
export async function renewLicense(
  id: string,
  next: {
    startDate: string | null;
    expireDate: string | null;
    pricePerYear: number | null;
    seats: number | null;
    note: string;
  },
  actorId: string,
): Promise<void> {
  const license = await getLicense(id);
  check(
    await db().from("software_license_renewals").insert({
      license_id: id,
      start_date: license.startDate,
      expire_date: license.expireDate,
      price_per_year: license.pricePerYear,
      seats: license.seats,
      note: next.note,
      renewed_by: actorId,
    }),
  );
  check(
    await db()
      .from("software_licenses")
      .update({
        start_date: next.startDate,
        expire_date: next.expireDate,
        price_per_year: next.pricePerYear ?? license.pricePerYear,
        seats: next.seats ?? license.seats,
        status: "active",
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id),
  );
}

export async function listRenewals(id: string): Promise<LicenseRenewal[]> {
  const rows = check(
    await db()
      .from("software_license_renewals")
      .select("id, start_date, expire_date, price_per_year, seats, note, renewed_at, employees(name)")
      .eq("license_id", id)
      .order("renewed_at", { ascending: false }),
  ) as unknown as {
    id: number;
    start_date: string | null;
    expire_date: string | null;
    price_per_year: number | string | null;
    seats: number | null;
    note: string;
    renewed_at: string;
    employees: { name: string } | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    startDate: row.start_date,
    expireDate: row.expire_date,
    pricePerYear: num(row.price_per_year),
    seats: row.seats,
    note: row.note,
    renewedAt: row.renewed_at,
    renewedBy: row.employees?.name ?? null,
  }));
}

export { dateOf as parseLicenseDate, amountOf as parseLicenseAmount };
