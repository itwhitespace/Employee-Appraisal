/**
 * IT Assets, phase 1: software licenses. Shared by the browser and the server.
 * One license = one purchase (lot) of a program or service; lots with the same name are shown
 * together. Prices are baht per year, also for contracts of several years.
 */

export type BillingCycle = "monthly" | "1y" | "2y" | "3y" | "perpetual";
export type LicenseType = "subscription" | "perpetual";
export type PaymentMethod = "" | "invoice" | "card" | "other";
export type LicenseStatus = "active" | "cancelled";

export interface SoftwareLicense {
  id: string;
  name: string;
  /** What tells this lot apart: domain name, contract or order number, edition. */
  detail: string;
  category: string;
  licenseType: LicenseType;
  billingCycle: BillingCycle;
  /** Monthly charges: the day of the month they are taken. */
  renewDay: number | null;
  startDate: string | null;
  expireDate: string | null;
  seats: number | null;
  unitPrice: number | null;
  /** Baht per year. */
  pricePerYear: number | null;
  paymentMethod: PaymentMethod;
  /** e.g. "Mastercard ••1234". */
  cardLabel: string;
  vendor: string;
  vendorContact: string;
  status: LicenseStatus;
  remark: string;
  updatedAt: string;
}

export type LicenseInput = Omit<SoftwareLicense, "id" | "updatedAt">;

/** A term that was replaced by a renewal. */
export interface LicenseRenewal {
  id: number;
  startDate: string | null;
  expireDate: string | null;
  pricePerYear: number | null;
  seats: number | null;
  note: string;
  renewedAt: string;
  renewedBy: string | null;
}

export const CATEGORIES = [
  "โปรแกรมออกแบบ",
  "งานสำนักงาน",
  "ความปลอดภัย / เครือข่าย",
  "เว็บไซต์ / การตลาด",
  "อื่น ๆ",
] as const;

/** Colour dot of each category. */
export const CATEGORY_DOT: Record<string, string> = {
  โปรแกรมออกแบบ: "bg-indigo-500",
  งานสำนักงาน: "bg-sky-500",
  "ความปลอดภัย / เครือข่าย": "bg-amber-500",
  "เว็บไซต์ / การตลาด": "bg-rose-500",
  "อื่น ๆ": "bg-slate-400",
};

export const CYCLE_NAMES: Record<BillingCycle, string> = {
  monthly: "รายเดือน",
  "1y": "รายปี",
  "2y": "2 ปี",
  "3y": "3 ปี",
  perpetual: "ซื้อขาด",
};

/** Months of one term; null for monthly charges without an end and for perpetual licenses. */
export const CYCLE_MONTHS: Record<BillingCycle, number | null> = {
  monthly: 1,
  "1y": 12,
  "2y": 24,
  "3y": 36,
  perpetual: null,
};

export const PAYMENT_NAMES: Record<PaymentMethod, string> = {
  "": "–",
  invoice: "ใบเสนอราคา / วางบิล",
  card: "บัตรเครดิต",
  other: "อื่น ๆ",
};

export const EMPTY_LICENSE: LicenseInput = {
  name: "",
  detail: "",
  category: "โปรแกรมออกแบบ",
  licenseType: "subscription",
  billingCycle: "1y",
  renewDay: null,
  startDate: null,
  expireDate: null,
  seats: 1,
  unitPrice: null,
  pricePerYear: null,
  paymentMethod: "",
  cardLabel: "",
  vendor: "",
  vendorContact: "",
  status: "active",
  remark: "",
};

/** Today in Thailand, as yyyy-mm-dd. */
export const todayIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

/** Whole days from today to the expiry date; negative once it has passed; null without one. */
export function daysLeft(license: Pick<SoftwareLicense, "expireDate">, today = todayIso()): number | null {
  if (!license.expireDate) return null;
  return Math.round(
    (Date.parse(`${license.expireDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
}

/** `iso` plus `months`, keeping the day where the month allows (31 Jan + 1 = 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** The next term after a renewal: from the old expiry date, for one more cycle. */
export function nextTerm(license: Pick<SoftwareLicense, "expireDate" | "billingCycle">, today = todayIso()) {
  const months = CYCLE_MONTHS[license.billingCycle];
  const start = license.expireDate ?? today;
  return { startDate: start, expireDate: months ? addMonths(start, months) : null };
}

/** Where a license stands today. */
export function standingOf(license: SoftwareLicense, today = todayIso()) {
  if (license.status === "cancelled") return { label: "ยกเลิก", tone: "bg-slate-100 text-slate-500" };
  if (license.billingCycle === "perpetual") return { label: "ซื้อขาด", tone: "bg-slate-100 text-slate-600" };
  if (license.billingCycle === "monthly" && !license.expireDate) {
    return { label: `ตัดทุกวันที่ ${license.renewDay ?? "–"}`, tone: "bg-slate-100 text-slate-600" };
  }
  const days = daysLeft(license, today);
  if (days === null) return { label: "ไม่มีวันหมด", tone: "bg-slate-100 text-slate-600" };
  if (days < 0) return { label: `หมดแล้ว ${-days} วัน`, tone: "bg-red-600 text-white" };
  if (days <= 30) return { label: `${days} วัน`, tone: "bg-red-100 text-red-700" };
  if (days <= 90) return { label: `${days} วัน`, tone: "bg-amber-100 text-amber-800" };
  return { label: `${days} วัน`, tone: "bg-emerald-50 text-emerald-700" };
}

/** Same program, so shown together: names compared without case and spaces. */
export const productKey = (name: string) => name.toLowerCase().replace(/\s+/g, "");
