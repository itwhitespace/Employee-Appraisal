import { budgetGroupOf, type BillingCycle, type LicenseInput } from "./software";

/**
 * Reads the "License Overview" sheet of the IT software inventory (.xlsx) in the browser.
 * Rows that are cancelled (red, or "ยกเลิก" with no seats), unnumbered, or advertising are left
 * out with the reason. Passwords in Remark or Detail are dropped, never sent.
 */

export interface LicenseLine {
  sheetRow: number;
  input: LicenseInput;
  /** Why the line is left out; null = to import. */
  skip: string | null;
  /** Things to check before importing. */
  flags: string[];
}

export class LicenseImportError extends Error {}

const HEADINGS = {
  no: ["no", "no."],
  name: ["software"],
  detail: ["detail"],
  type: ["licensetype"],
  term: ["contract"],
  start: ["startdate"],
  expire: ["expiredate"],
  remain: ["remainday"],
  seats: ["seat", "seats"],
  unit: ["price/unit", "priceunit"],
  perYear: ["price/year", "priceyear"],
  payment: ["paymentmethod"],
  owner: ["owner", "vendor"],
  contact: ["contact"],
  remark: ["remark"],
} as const;
type Field = keyof typeof HEADINGS;

const squash = (text: string) => text.toLowerCase().replace(/[\s_-]+/g, "");

function textOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as { result?: unknown; richText?: { text: string }[]; text?: string };
    if (v.richText)
      return v.richText
        .map((t) => t.text)
        .join("")
        .trim();
    if (v.result !== undefined) return textOf(v.result);
    if (typeof v.text === "string") return v.text.trim();
    return "";
  }
  return String(value).trim();
}
function dateOf(value: unknown): string | null {
  const raw =
    value && typeof value === "object" && "result" in value ? (value as { result: unknown }).result : value;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  const m = textOf(raw).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
function numberOf(value: unknown): number | null {
  const t = textOf(value).replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

const CATEGORY: [RegExp, string][] = [
  [/auto\s*cad|3d\s*max|sketch\s*up|enscape|v-?ray|adobe|photoshop|fredo|lumion|revit/i, "โปรแกรมออกแบบ"],
  [/google workspace|office|zoom|zoho|workplace|pdf|icloud|microsoft/i, "งานสำนักงาน"],
  [/eset|antivirus|fortigate|firewall/i, "ความปลอดภัย / เครือข่าย"],
  [/domain|hosting|kinsta|elementor|sms|wordpress/i, "เว็บไซต์ / การตลาด"],
];
const categoryOf = (name: string) => CATEGORY.find(([re]) => re.test(name))?.[1] ?? "อื่น ๆ";

function cycleOf(type: string, term: string, dates: string): BillingCycle {
  if (/ซื้อขาด/.test(type) || /∞/.test(term)) return "perpetual";
  if (/mont/i.test(term) || /renew monthly|ทุกวันที่/i.test(dates)) return "monthly";
  const years = term.match(/(\d+)\s*year/i)?.[1];
  return years === "2" ? "2y" : years === "3" ? "3y" : "1y";
}

/** Pink / red fills: the sheet's way of marking a cancelled line. */
const CANCELLED_FILL = /^FF(F6B3AE|FF0000|FFC7CE|F4CCCC|EA9999)$/i;
const PASSWORD = /pass\s*(word|mail)?\s*[:=]|รหัสผ่าน/i;

export async function readLicenseWorkbook(file: File): Promise<{ sheet: string; lines: LicenseLine[] }> {
  if (!/\.xlsx$/i.test(file.name)) throw new LicenseImportError("รองรับเฉพาะไฟล์ .xlsx");
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new LicenseImportError("เปิดไฟล์นี้ไม่ได้ กรุณาตรวจสอบว่าเป็นไฟล์ Excel (.xlsx)");
  }
  const sheets = [...book.worksheets].sort(
    (a, b) => Number(/license overview/i.test(b.name)) - Number(/license overview/i.test(a.name)),
  );
  for (const sheet of sheets) {
    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
      const columns: Partial<Record<Field, number>> = {};
      sheet.getRow(r).eachCell((cell, c) => {
        const heading = squash(textOf(cell.value));
        for (const field of Object.keys(HEADINGS) as Field[]) {
          if ((HEADINGS[field] as readonly string[]).includes(heading) && columns[field] === undefined) {
            columns[field] = c;
          }
        }
      });
      if (columns.name === undefined || columns.expire === undefined) continue;

      const lines: LicenseLine[] = [];
      for (let i = r + 1; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const cell = (field: Field) => (columns[field] ? row.getCell(columns[field]!) : null);
        const read = (field: Field) => cell(field)?.value ?? null;
        const name = textOf(read("name")).replace(/\s+/g, " ");
        if (!name) continue;

        const type = textOf(read("type"));
        const term = textOf(read("term"));
        const startText = textOf(read("start"));
        const billingCycle = cycleOf(type, term, `${startText} ${textOf(read("expire"))}`);
        const seats = numberOf(read("seats"));
        const unitPrice = numberOf(read("unit"));
        const sheetYear = numberOf(read("perYear"));
        const perYear =
          sheetYear ??
          (unitPrice !== null && seats ? unitPrice * seats * (billingCycle === "monthly" ? 12 : 1) : null);
        const payment = textOf(read("payment"));
        const card = /mastercard|visa|jcb|card|บัตร/i.test(payment);
        const brand = payment.match(/mastercard|visa|jcb/i)?.[0];
        const last4 = payment.match(/(\d{4})(?!.*\d{4})/)?.[1];
        const owner = textOf(read("owner"));
        const remark = textOf(read("remark"));
        const detail = textOf(read("detail"));
        const fill = (cell("name")?.fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb ?? "";

        const flags: string[] = [];
        if (PASSWORD.test(remark)) flags.push("Remark มีรหัสผ่าน: ไม่นำเข้า");
        if (PASSWORD.test(detail)) flags.push("Detail มีรหัสผ่าน: ไม่นำเข้า");
        if (/usd/i.test(`${remark} ${textOf(read("unit"))}`)) flags.push("ราคาเดิมเป็น USD: ตรวจยอดบาท");
        if (perYear === null && billingCycle !== "perpetual") flags.push("ยังไม่มีราคา");
        const expireDate = billingCycle === "perpetual" ? null : dateOf(read("expire"));
        if (!expireDate && billingCycle !== "perpetual" && billingCycle !== "monthly")
          flags.push("ไม่มีวันหมดอายุ");

        const skip = !textOf(read("no"))
          ? "ไม่มีเลข No."
          : CANCELLED_FILL.test(fill)
            ? "แถวสีแดง (ยกเลิก)"
            : /google ads|facebook ads/i.test(name)
              ? "ค่าโฆษณา"
              : /ยกเลิก/.test(textOf(read("remain"))) && seats === 0
                ? "เขียนว่า ยกเลิก และ Seat = 0"
                : null;

        lines.push({
          sheetRow: i,
          skip,
          flags,
          input: {
            name,
            detail: PASSWORD.test(detail) ? "" : detail.slice(0, 200),
            category: categoryOf(name),
            licenseType: /ซื้อขาด/.test(type) || billingCycle === "perpetual" ? "perpetual" : "subscription",
            billingCycle,
            renewDay:
              billingCycle === "monthly"
                ? Number(startText.match(/ทุกวันที่\s*(\d{1,2})/)?.[1] ?? "") || null
                : null,
            startDate: dateOf(read("start")),
            expireDate,
            seats: seats === null ? null : Math.round(seats),
            unitPrice,
            pricePerYear: perYear === null ? null : Math.round(perYear * 100) / 100,
            paymentMethod: /quotation|วางบิล|invoice/i.test(payment)
              ? "invoice"
              : card
                ? "card"
                : payment
                  ? "other"
                  : "",
            cardLabel: card
              ? `${brand ? brand[0].toUpperCase() + brand.slice(1).toLowerCase() : "บัตร"}${last4 ? ` ••${last4}` : ""}`
              : "",
            vendor: !owner || /https?:|credit card|ซื้อ|uob|บัตร/i.test(owner) ? "" : owner.slice(0, 120),
            vendorContact: PASSWORD.test(textOf(read("contact")))
              ? ""
              : textOf(read("contact")).slice(0, 200),
            status: "active",
            budgetGroup: budgetGroupOf(categoryOf(name)),
            remark: PASSWORD.test(remark) ? "" : remark.slice(0, 500),
          },
        });
      }
      return { sheet: sheet.name, lines };
    }
  }
  throw new LicenseImportError('ไม่พบหัวคอลัมน์ "Software" และ "Expire Date" ในไฟล์นี้');
}
