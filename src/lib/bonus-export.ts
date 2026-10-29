import { PERFORMANCE_CAPTIONS, POTENTIAL_GROUPS } from "./bonus";
import { rowMultiplier } from "./merit";
import type { BonusPlan } from "./types";

/**
 * The bonus as an Excel workbook laid out like the Bonus sheet of Model.xls: budget and Bonus
 * Matrix on top, then one row per person, and the totals per Studio / Team.
 * Annual Salary, Total and Salary X are Excel formulas, so edits to Adjusted add up.
 */

export interface BonusExportRow {
  code: string;
  name: string;
  nickname: string;
  department: string;
  team: string;
  jobTitle: string;
  jobLevel: string;
  performance: number | null;
  potential: number | null;
  group: string | null;
  suggestedPercent: number | null;
  baseSalary: number | null;
  suggested: number | null;
  adjusted: number | null;
  tenure: string;
  note: string;
}

export interface BonusExport {
  cycleId: string;
  filter: string;
  plan: BonusPlan;
  budget: number | null;
  spend: number;
  gap: number;
  anchor: number;
  groups: { name: string; people: number; bonus: number; salary: number }[];
  rows: BonusExportRow[];
}

const MAROON = "FF963634";
const GREY = "FFD9D9D9";
const LIGHT_GREY = "FFF2F2F2";
const LIME = "FFC4D79B";
const YELLOW = "FFFFFF00";
const ROSE = "FFF2DCDB";
const RED = "FFFF0000";
const MONEY = "#,##0";

export async function bonusWorkbook(data: BonusExport): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  book.calcProperties.fullCalcOnLoad = true;
  const sheet = book.addWorksheet("Bonus", {
    views: [{ state: "frozen", xSplit: 3, ySplit: 15, showGridLines: false }],
  });
  type Cell = ReturnType<typeof sheet.getCell>;
  const fill = (cell: Cell, argb: string) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  };
  const thin = { style: "thin" as const, color: { argb: "FFA6A6A6" } };
  const box = (cell: Cell) => {
    cell.border = { top: thin, left: thin, bottom: thin, right: thin };
  };
  const white = { bold: true, color: { argb: "FFFFFFFF" } };

  // ---- title and budget ------------------------------------------------
  sheet.getCell("B1").value = "Bonus Compensation";
  sheet.getCell("B1").font = { bold: true, size: 13 };
  sheet.getCell("B2").value = `รอบ ${data.cycleId} · ${data.filter}`;
  sheet.getCell("B2").font = { bold: true, color: { argb: "FF0070C0" } };
  const budget: [string, number | null, string][] = [
    ["Budget", data.budget, MONEY],
    ["Total Bonus Spend", data.spend, MONEY],
    ["Gap", data.gap, MONEY],
    ["ค่ากลาง (% ของเงินเดือนทั้งปี)", data.anchor, "0.00%"],
  ];
  budget.forEach(([label, value, format], i) => {
    sheet.getCell(4 + i, 2).value = label;
    const cell = sheet.getCell(4 + i, 4);
    cell.value = value;
    cell.numFmt = format;
    if (label === "Gap") fill(cell, YELLOW);
    if (label === "Total Bonus Spend") cell.font = { bold: true, color: { argb: RED } };
  });

  // ---- Bonus Matrix ----------------------------------------------------
  const left = 7; // column G: Performance; H … L: Potential 5 … 1
  sheet.mergeCells(3, left + 1, 3, left + 5);
  const head = sheet.getCell(3, left + 1);
  head.value = "Potential";
  head.font = white;
  head.alignment = { horizontal: "center" };
  fill(head, MAROON);
  const corner = sheet.getCell(4, left);
  corner.value = "Performance";
  [5, 4, 3, 2, 1].forEach((potential, i) => {
    const multiplier = sheet.getCell(2, left + 1 + i);
    multiplier.value = rowMultiplier(potential, data.plan.columnMultipliers);
    multiplier.numFmt = "0%";
    multiplier.font = { color: { argb: RED } };
    multiplier.alignment = { horizontal: "center" };
    sheet.getCell(4, left + 1 + i).value = `${potential} ${POTENTIAL_GROUPS[i]}`;
  });
  for (let c = left; c <= left + 5; c++) {
    const cell = sheet.getCell(4, c);
    cell.font = white;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fill(cell, MAROON);
    box(cell);
  }
  sheet.getRow(4).height = 30;
  [5, 4, 3, 2, 1].forEach((performance, r) => {
    const row = 5 + r;
    const rowMult = rowMultiplier(performance, data.plan.rowMultipliers);
    const caption = sheet.getCell(row, left - 2);
    caption.value = PERFORMANCE_CAPTIONS[r];
    caption.font = { color: { argb: "FF808080" } };
    const multiplier = sheet.getCell(row, left - 1);
    multiplier.value = rowMult;
    multiplier.numFmt = "0%";
    multiplier.font = { color: { argb: RED } };
    const label = sheet.getCell(row, left);
    label.value = performance;
    label.font = white;
    label.alignment = { horizontal: "center" };
    fill(label, MAROON);
    box(label);
    [5, 4, 3, 2, 1].forEach((potential, i) => {
      const cell = sheet.getCell(row, left + 1 + i);
      cell.value = data.anchor * rowMult * rowMultiplier(potential, data.plan.columnMultipliers);
      cell.numFmt = "0.0%";
      cell.alignment = { horizontal: "center" };
      if (performance === 3 && potential === 3) fill(cell, LIME);
      box(cell);
    });
  });

  // ---- people ------------------------------------------------------------
  const columns: { header: string; width: number; tone?: string; cells?: string; format?: string }[] = [
    { header: "No.", width: 5 },
    { header: "รหัส", width: 8 },
    { header: "Employee Name", width: 26 },
    { header: "Nickname", width: 10 },
    { header: "Studio / Team", width: 16 },
    { header: "Job Title", width: 26 },
    { header: "Job level", width: 9 },
    { header: "Performance", width: 12, format: "0.00" },
    { header: "Potential", width: 10, format: "0.00" },
    { header: "Group of Potential", width: 17 },
    { header: "Bonus Suggestion", width: 12, format: "0.0%" },
    { header: "Base Salary", width: 12, cells: LIGHT_GREY, format: MONEY },
    { header: "Annual Salary", width: 13, cells: LIGHT_GREY, format: MONEY },
    { header: "Bonus Spending", width: 13, format: MONEY },
    { header: "Adjusted", width: 12, tone: YELLOW, cells: YELLOW, format: MONEY },
    { header: "Total", width: 13, tone: ROSE, cells: ROSE, format: MONEY },
    { header: "Salary X", width: 9, format: "0.00" },
    { header: "อายุงาน", width: 16 },
    { header: "หมายเหตุ", width: 30 },
  ];
  columns.forEach((column, i) => {
    sheet.getColumn(i + 1).width = column.width;
  });
  const sumRow = 14;
  const headerRow = 15;
  const first = headerRow + 1;
  const last = headerRow + Math.max(1, data.rows.length);
  const letter = (index: number) => sheet.getColumn(index).letter;
  columns.forEach((column, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = column.header;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fill(cell, column.tone ?? GREY);
    box(cell);
  });
  sheet.getRow(headerRow).height = 30;

  data.rows.forEach((item, index) => {
    const r = first + index;
    const values: (string | number | null)[] = [
      index + 1,
      item.code,
      item.name,
      item.nickname || null,
      item.team,
      item.jobTitle || null,
      item.jobLevel,
      item.performance,
      item.potential,
      item.group,
      item.suggestedPercent,
      item.baseSalary,
      null,
      item.suggested,
      item.adjusted,
    ];
    values.forEach((value, i) => {
      sheet.getCell(r, i + 1).value = value;
    });
    const L = (c: number) => `${letter(c)}${r}`;
    if (item.baseSalary !== null) sheet.getCell(r, 13).value = { formula: `${L(12)}*12` };
    if (item.suggested !== null) {
      sheet.getCell(r, 16).value = { formula: `MAX(0,SUM(${L(14)},${L(15)}))` };
      sheet.getCell(r, 17).value = { formula: `IF(${L(12)}>0,${L(16)}/${L(12)},"")` };
    }
    sheet.getCell(r, 18).value = item.tenure || null;
    sheet.getCell(r, 19).value = item.note || null;
    columns.forEach((column, i) => {
      const cell = sheet.getCell(r, i + 1);
      box(cell);
      if (column.cells) fill(cell, column.cells);
      if (column.format) cell.numFmt = column.format;
    });
    for (const c of [1, 2, 7, 8, 9, 10]) sheet.getCell(r, c).alignment = { horizontal: "center" };
    if (item.note.startsWith("ไม่ได้รับ")) {
      for (let c = 1; c <= 4; c++) sheet.getCell(r, c).font = { color: { argb: "FF808080" } };
    }
  });

  const label = sheet.getCell(sumRow, 11);
  label.value = "รวม";
  label.font = { bold: true };
  label.alignment = { horizontal: "right" };
  for (const c of [12, 13, 14, 15, 16]) {
    const cell = sheet.getCell(sumRow, c);
    cell.value = { formula: `SUBTOTAL(9,${letter(c)}${first}:${letter(c)}${last})` };
    cell.numFmt = MONEY;
    cell.font = { bold: true };
    fill(cell, columns[c - 1].tone ?? LIGHT_GREY);
    box(cell);
  }
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: columns.length } };

  // ---- totals per Studio / Team ------------------------------------------
  const summary = book.addWorksheet("สรุปตามทีม", { views: [{ showGridLines: false }] });
  const heads = ["Studio / Team", "คน", "โบนัสรวม", "% ของโบนัส", "เงินเดือนรวม / เดือน", "% ของเงินเดือน"];
  const widths = [24, 8, 16, 13, 20, 15];
  heads.forEach((text, i) => {
    summary.getColumn(i + 1).width = widths[i];
    const cell = summary.getCell(1, i + 1);
    cell.value = text;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center" };
    fill(cell, GREY);
    box(cell);
  });
  const end = data.groups.length + 1;
  data.groups.forEach((group, i) => {
    const r = i + 2;
    summary.getRow(r).values = [group.name, group.people, group.bonus, null, group.salary, null];
    summary.getCell(r, 4).value = { formula: `IF(SUM(C$2:C$${end})>0,C${r}/SUM(C$2:C$${end}),"")` };
    summary.getCell(r, 6).value = { formula: `IF(SUM(E$2:E$${end})>0,E${r}/SUM(E$2:E$${end}),"")` };
  });
  const totalRow = end + 1;
  summary.getRow(totalRow).values = ["รวม"];
  summary.getCell(totalRow, 2).value = { formula: `SUM(B2:B${end})` };
  summary.getCell(totalRow, 3).value = { formula: `SUM(C2:C${end})` };
  summary.getCell(totalRow, 5).value = { formula: `SUM(E2:E${end})` };
  for (let r = 2; r <= totalRow; r++) {
    for (let c = 1; c <= 6; c++) {
      const cell = summary.getCell(r, c);
      box(cell);
      if (c === 3 || c === 5) cell.numFmt = MONEY;
      if (c === 4 || c === 6) cell.numFmt = "0.0%";
      if (r === totalRow) {
        cell.font = { bold: true };
        fill(cell, LIGHT_GREY);
      }
    }
  }

  const buffer = await book.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
