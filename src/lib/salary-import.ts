import type { CompensationRow } from "./types";

/**
 * Reads the "raw data" sheet of the company's salary workbook (saved as .xlsx) in the browser
 * and pairs each line with an employee by name. Only the columns below are read: nothing else
 * in the file, such as national ID numbers, is kept or sent anywhere.
 */

export interface ImportLine {
  /** Row number in the sheet, for pointing back at the file. */
  sheetRow: number;
  thaiName: string;
  englishName: string;
  nickname: string;
  jobLevel: string;
  baseSalary: number | null;
  allowance: number | null;
}

/** Headings looked for, compared without case, spaces or line breaks. */
const HEADINGS = {
  thaiName: ["employeename"],
  englishName: ["name"],
  nickname: ["nickname"],
  jobLevel: ["joblevel"],
  baseSalary: ["basesalary"],
  allowance: ["allowance", "existingallowance"],
} as const;

type Field = keyof typeof HEADINGS;

const squash = (text: string) => text.toLowerCase().replace(/[\s._-]+/g, "");

/** What a cell shows: the result of a formula, rich text joined, dates and errors left out. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "string") return String(value).trim();
  if (typeof value === "object") {
    const v = value as { result?: unknown; richText?: { text: string }[]; text?: string };
    if (v.richText)
      return v.richText
        .map((part) => part.text)
        .join("")
        .trim();
    if (v.result !== undefined) return cellText(v.result);
    if (typeof v.text === "string") return v.text.trim();
  }
  return "";
}

function amount(value: unknown): number | null {
  const text = cellText(value).replace(/,/g, "");
  if (text === "" || text === "-") return null;
  const number = Number(text);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

export class ImportError extends Error {}

/** The lines of the raw data sheet; throws ImportError with a message for the user. */
export async function readSalaryWorkbook(file: File): Promise<{ sheet: string; lines: ImportLine[] }> {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new ImportError(
      "รองรับเฉพาะไฟล์ .xlsx · เปิดไฟล์ใน Excel แล้ว Save As เป็น Excel Workbook (.xlsx)",
    );
  }
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new ImportError("เปิดไฟล์นี้ไม่ได้ กรุณาตรวจสอบว่าเป็นไฟล์ Excel (.xlsx)");
  }

  // The "raw data" sheet first, then any sheet that has the headings.
  const sheets = [...book.worksheets].sort(
    (a, b) => Number(/raw/i.test(b.name)) - Number(/raw/i.test(a.name)),
  );
  for (const sheet of sheets) {
    for (let r = 1; r <= Math.min(30, sheet.rowCount); r++) {
      const columns: Partial<Record<Field, number>> = {};
      sheet.getRow(r).eachCell((cell, c) => {
        const heading = squash(cellText(cell.value));
        for (const field of Object.keys(HEADINGS) as Field[]) {
          if ((HEADINGS[field] as readonly string[]).includes(heading) && columns[field] === undefined) {
            columns[field] = c;
          }
        }
      });
      if (columns.thaiName === undefined || columns.baseSalary === undefined) continue;

      const lines: ImportLine[] = [];
      for (let i = r + 1; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const read = (field: Field) => (columns[field] ? row.getCell(columns[field]!).value : null);
        const thaiName = cellText(read("thaiName"));
        const englishName = cellText(read("englishName"));
        if (!thaiName && !englishName) continue;
        lines.push({
          sheetRow: i,
          thaiName,
          englishName,
          nickname: cellText(read("nickname")),
          jobLevel: cellText(read("jobLevel")),
          baseSalary: amount(read("baseSalary")),
          allowance: amount(read("allowance")),
        });
      }
      return { sheet: sheet.name, lines };
    }
  }
  throw new ImportError('ไม่พบหัวคอลัมน์ "Employee Name" และ "base salary" ในไฟล์นี้');
}

const PREFIXES = /^(นางสาว|นาง|นาย|น\.ส\.?|ด\.ช\.|ด\.ญ\.|mrs\.?|mr\.?|ms\.?|miss)\s*/i;

/** A name without its title, spaces and case, for comparing. */
export function nameKey(name: string): string {
  return name.trim().replace(PREFIXES, "").toLowerCase().replace(/\s+/g, "");
}

export type MatchKind = "name" | "english" | "nickname" | "none" | "ambiguous";

export interface ImportMatch {
  line: ImportLine;
  /** Candidates when the match is not certain. */
  candidates: CompensationRow[];
  row: CompensationRow | null;
  kind: MatchKind;
}

/** Thai name first, then the English name, then the nickname; anything unsure is flagged. */
export function matchLines(lines: ImportLine[], rows: CompensationRow[]): ImportMatch[] {
  const byName = (key: string) => rows.filter((row) => key && nameKey(row.employee.name) === key);
  return lines.map((line): ImportMatch => {
    const thai = byName(nameKey(line.thaiName));
    if (thai.length === 1) return { line, candidates: thai, row: thai[0], kind: "name" };
    const english = byName(nameKey(line.englishName));
    if (english.length === 1) return { line, candidates: english, row: english[0], kind: "english" };
    const nick = squashNick(line.nickname);
    const byNick = nick ? rows.filter((row) => squashNick(row.employee.nickname) === nick) : [];
    // Several people with the same name: the nickname picks one.
    const pool = thai.length > 1 ? thai : english;
    if (pool.length > 1) {
      const narrowed = pool.filter((row) => byNick.includes(row));
      return narrowed.length === 1
        ? { line, candidates: pool, row: narrowed[0], kind: "nickname" }
        : { line, candidates: pool, row: null, kind: "ambiguous" };
    }
    if (byNick.length === 1) return { line, candidates: byNick, row: byNick[0], kind: "nickname" };
    return { line, candidates: byNick, row: null, kind: byNick.length > 1 ? "ambiguous" : "none" };
  });
}

const squashNick = (nickname: string) => nickname.toLowerCase().replace(/\s+/g, "");
