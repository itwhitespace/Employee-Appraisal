import { COMPA_GROUPS } from "./compensation";
import { rowMultiplier } from "./merit";
import type { MeritPlan } from "./types";

/**
 * The merit table as an Excel workbook laid out like the company's Model.xls: the budget and
 * the Merit Increase Matrix on top, then one row per employee with the same column colours.
 * exceljs is loaded only when a file is made, so the page itself stays light.
 */

export interface MeritExportRow {
  code: string;
  name: string;
  nickname: string;
  /** Job title. */
  position: string;
  /** yyyy-mm-dd, or null when not known. */
  startDate: string | null;
  department: string;
  jobLevel: string;
  grade: number | null;
  performance: number | null;
  competency: number | null;
  ratio: number | null;
  group: string | null;
  suggestedPercent: number | null;
  suggested: number | null;
  baseSalary: number | null;
  allowance: number | null;
  roundUp: number | null;
  increaseAllowance: number | null;
  note: string;
}

export interface MeritExport {
  cycleId: string;
  filter: string;
  plan: MeritPlan;
  budget: number | null;
  spend: number;
  gap: number;
  anchor: number;
  rows: MeritExportRow[];
}

// Model.xls colours.
const MAROON = "FF963634";
const GREY = "FFD9D9D9";
const LIGHT_GREY = "FFF2F2F2";
const GREEN = "FF92D050";
const LIME = "FFC4D79B";
const YELLOW = "FFFFFF00";
const BLUE = "FF4F81BD";
const LIGHT_BLUE = "FFDCE6F1";
const ORANGE = "FFF79646";
const LIGHT_ORANGE = "FFFCD5B4";
const RED = "FFFF0000";

const MONEY = "#,##0";
const PERCENT = "0.0%";

type Workbook = InstanceType<(typeof import("exceljs"))["Workbook"]>;

/**
 * Sheet 1: the people and their current pay. The headings match the company's raw data sheet,
 * so the salary import page reads this sheet too.
 */
function addEmployeeSheet(book: Workbook, rows: MeritExportRow[]) {
  const sheet = book.addWorksheet("พนักงาน", {
    views: [{ state: "frozen", xSplit: 3, ySplit: 1, showGridLines: false }],
  });
  const columns: { header: string; width: number; money?: boolean; center?: boolean }[] = [
    { header: "No.", width: 5, center: true },
    { header: "รหัส", width: 8, center: true },
    { header: "Employee Name", width: 28 },
    { header: "Nickname", width: 11 },
    { header: "ฝ่าย", width: 20 },
    { header: "Job Title", width: 30 },
    { header: "Job level", width: 9, center: true },
    { header: "Grade", width: 7, center: true },
    { header: "วันเริ่มงาน", width: 12, center: true },
    { header: "อายุงาน (ปี)", width: 11, center: true },
    { header: "base salary", width: 13, money: true },
    { header: "allowance", width: 12, money: true },
    { header: "Total", width: 13, money: true },
  ];
  const thin = { style: "thin" as const, color: { argb: "FFA6A6A6" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  columns.forEach((column, i) => {
    sheet.getColumn(i + 1).width = column.width;
    const cell = sheet.getCell(1, i + 1);
    cell.value = column.header;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
    cell.border = border;
  });
  sheet.getRow(1).height = 22;

  const now = Date.now();
  rows.forEach((item, index) => {
    const r = index + 2;
    // Midnight UTC: Excel stores dates without a time zone.
    const started = item.startDate ? new Date(`${item.startDate}T00:00:00Z`) : null;
    const values: (string | number | Date | null)[] = [
      index + 1,
      item.code,
      item.name,
      item.nickname || null,
      item.department,
      item.position || null,
      item.jobLevel,
      item.grade,
      started,
      started ? Math.floor(((now - started.getTime()) / (365.25 * 86_400_000)) * 10) / 10 : null,
      item.baseSalary,
      item.allowance,
    ];
    values.forEach((value, i) => {
      sheet.getCell(r, i + 1).value = value;
    });
    if (item.baseSalary !== null) {
      sheet.getCell(r, 13).value = { formula: `K${r}+L${r}` };
    }
    columns.forEach((column, i) => {
      const cell = sheet.getCell(r, i + 1);
      cell.border = border;
      if (column.money) cell.numFmt = MONEY;
      if (column.center) cell.alignment = { horizontal: "center" };
    });
    sheet.getCell(r, 9).numFmt = "dd/mm/yyyy";
    sheet.getCell(r, 10).numFmt = "0.0";
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

export async function meritWorkbook(data: MeritExport): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  // The formulas carry no saved results: have Excel work them out on opening.
  book.calcProperties.fullCalcOnLoad = true;
  addEmployeeSheet(book, data.rows);
  const sheet = book.addWorksheet("Merit Increase", {
    views: [{ state: "frozen", xSplit: 3, ySplit: 14, showGridLines: false }],
  });
  type Cell = ReturnType<typeof sheet.getCell>;

  const fill = (cell: Cell, argb: string) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  };
  const thin = { style: "thin" as const, color: { argb: "FFA6A6A6" } };
  const box = (cell: Cell) => {
    cell.border = { top: thin, left: thin, bottom: thin, right: thin };
  };

  // ---- title and budget (top left) ------------------------------------
  sheet.getCell("B1").value = "Merit Salary Increase Matrix";
  sheet.getCell("B1").font = { bold: true, size: 13 };
  sheet.getCell("B2").value = `รอบ ${data.cycleId} · ${data.filter}`;
  sheet.getCell("B2").font = { color: { argb: "FF0070C0" }, bold: true };

  const budgetRows: [string, number | null, string?][] = [
    ["Total Merit increase budget", data.budget],
    ["Total Merit increase spend", data.spend, "FFF79646"],
    ["Gap", data.gap],
    ["ค่ากลาง (90–110%, Competency 3)", data.anchor],
  ];
  budgetRows.forEach(([label, value, color], i) => {
    const row = 4 + i;
    const name = sheet.getCell(row, 2);
    name.value = label;
    if (color) name.font = { color: { argb: color } };
    const cell = sheet.getCell(row, 4);
    cell.value = value;
    cell.numFmt = i === 3 ? "0.00%" : MONEY;
    cell.alignment = { horizontal: "center" };
    if (i === 1) cell.font = { bold: true, color: { argb: RED } };
    if (i === 2) {
      fill(cell, YELLOW);
      cell.border = { bottom: { style: "double" } };
    }
  });

  // ---- Merit Increase Matrix (top right) ------------------------------
  const left = 8; // column H
  const head = sheet.getCell(3, left + 1);
  sheet.mergeCells(3, left + 1, 3, left + COMPA_GROUPS.length);
  head.value = "Compa-ratio";
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.alignment = { horizontal: "center" };
  fill(head, MAROON);
  const corner = sheet.getCell(4, left);
  corner.value = "Competency";
  COMPA_GROUPS.forEach((group, i) => {
    const multiplier = sheet.getCell(2, left + 1 + i);
    multiplier.value = data.plan.columnMultipliers[i];
    multiplier.numFmt = "0%";
    multiplier.font = { color: { argb: RED } };
    multiplier.alignment = { horizontal: "center" };
    sheet.getCell(4, left + 1 + i).value = group.label;
  });
  for (let c = left; c <= left + COMPA_GROUPS.length; c++) {
    const cell = sheet.getCell(4, c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    fill(cell, MAROON);
    box(cell);
  }
  [5, 4, 3, 2, 1].forEach((score, r) => {
    const row = 5 + r;
    const rowMult = rowMultiplier(score, data.plan.rowMultipliers);
    const multiplier = sheet.getCell(row, left - 1);
    multiplier.value = rowMult;
    multiplier.numFmt = "0%";
    multiplier.font = { color: { argb: RED } };
    const label = sheet.getCell(row, left);
    label.value = score;
    label.font = { bold: true, color: { argb: "FFFFFFFF" } };
    label.alignment = { horizontal: "center" };
    fill(label, MAROON);
    box(label);
    COMPA_GROUPS.forEach((_, i) => {
      const cell = sheet.getCell(row, left + 1 + i);
      cell.value = data.anchor * rowMult * data.plan.columnMultipliers[i];
      cell.numFmt = PERCENT;
      cell.alignment = { horizontal: "center" };
      if (score === 3 && i === 2) fill(cell, LIME);
      box(cell);
    });
  });

  // ---- employee table ---------------------------------------------------
  const columns: { header: string; width: number; tone?: string; cells?: string; dark?: boolean }[] = [
    { header: "No.", width: 5 },
    { header: "รหัส", width: 8 },
    { header: "ชื่อ", width: 26 },
    { header: "ฝ่าย", width: 18 },
    { header: "Job level", width: 9 },
    { header: "Grade", width: 7 },
    { header: "Performance\nScore", width: 12 },
    { header: "Competency\nScore", width: 12, tone: GREEN, cells: GREEN },
    { header: "Compa-ratio", width: 11 },
    { header: "Compa-ratio\nGrouping", width: 13 },
    { header: "Merit Increase\nsuggestion (%)", width: 14 },
    { header: "Merit Increase\nsuggestion (บาท)", width: 15 },
    { header: "Base Salary", width: 12, cells: LIGHT_GREY },
    { header: "Allowance", width: 11, cells: LIGHT_GREY },
    { header: "RoundUp\nMerit Increase", width: 14, tone: YELLOW, cells: YELLOW },
    { header: "Increase\nAllowance", width: 11, tone: YELLOW, cells: YELLOW },
    { header: "Adjusted Salary", width: 14, tone: BLUE, cells: LIGHT_BLUE, dark: true },
    { header: "New Allowance", width: 13, tone: BLUE, cells: LIGHT_BLUE, dark: true },
    { header: "Total", width: 13, tone: ORANGE, cells: LIGHT_ORANGE },
    { header: "หมายเหตุ", width: 34 },
  ];
  columns.forEach((column, i) => {
    sheet.getColumn(i + 1).width = column.width;
  });

  const sumRow = 13;
  const headerRow = 14;
  const first = headerRow + 1;
  const last = headerRow + Math.max(1, data.rows.length);
  const letter = (index: number) => sheet.getColumn(index).letter;

  columns.forEach((column, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: column.dark ? "FFFFFFFF" : "FF000000" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fill(cell, column.tone ?? GREY);
    box(cell);
  });
  sheet.getRow(headerRow).height = 32;

  data.rows.forEach((item, index) => {
    const r = first + index;
    const values: (string | number | null)[] = [
      index + 1,
      item.code,
      item.name,
      item.department,
      item.jobLevel,
      item.grade,
      item.performance,
      item.competency,
      item.ratio,
      item.group,
      item.suggestedPercent,
      item.suggested,
      item.baseSalary,
      item.allowance,
      item.roundUp,
      item.increaseAllowance || null,
    ];
    values.forEach((value, i) => {
      sheet.getCell(r, i + 1).value = value;
    });
    // Worked out by Excel, so edits in the file add up.
    if (item.baseSalary !== null) {
      sheet.getCell(r, 17).value = { formula: `${letter(13)}${r}+${letter(15)}${r}` };
      sheet.getCell(r, 18).value = { formula: `${letter(14)}${r}+${letter(16)}${r}` };
      sheet.getCell(r, 19).value = { formula: `${letter(17)}${r}+${letter(18)}${r}` };
    }
    sheet.getCell(r, 20).value = item.note || null;

    columns.forEach((column, i) => {
      const cell = sheet.getCell(r, i + 1);
      box(cell);
      if (column.cells) fill(cell, column.cells);
    });
    sheet.getCell(r, 7).numFmt = "0.00";
    sheet.getCell(r, 8).numFmt = "0.0";
    sheet.getCell(r, 9).numFmt = "0%";
    sheet.getCell(r, 11).numFmt = PERCENT;
    for (let c = 12; c <= 19; c++) sheet.getCell(r, c).numFmt = MONEY;
    for (const c of [1, 2, 5, 6, 7, 8, 9, 10]) sheet.getCell(r, c).alignment = { horizontal: "center" };
    // Out-of-band Compa-ratio groups in red, as in Model.xls.
    if (item.ratio !== null && (item.ratio < 0.8 || item.ratio >= 1.2)) {
      sheet.getCell(r, 10).font = { color: { argb: RED } };
    }
    if (item.note.startsWith("ไม่ได้ขึ้น")) {
      for (let c = 1; c <= 4; c++) sheet.getCell(r, c).font = { color: { argb: "FF808080" } };
    }
  });

  // Totals above the headings, only over the columns that add up.
  const label = sheet.getCell(sumRow, 11);
  label.value = "รวม";
  label.font = { bold: true };
  label.alignment = { horizontal: "right" };
  for (let c = 12; c <= 19; c++) {
    const cell = sheet.getCell(sumRow, c);
    cell.value = { formula: `SUBTOTAL(9,${letter(c)}${first}:${letter(c)}${last})` };
    cell.numFmt = MONEY;
    cell.font = { bold: true };
    fill(cell, columns[c - 1].tone ?? LIGHT_GREY);
    if (columns[c - 1].dark) cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    box(cell);
  }

  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: columns.length } };

  const buffer = await book.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
