import {
  channelLabel,
  DEVICE_STATUS,
  DEVICE_TYPES,
  diskSize,
  isOnline,
  typeOf,
  type Device,
  type DeviceHolder,
} from "./devices";

const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`) : null);

/**
 * The register as it is now, as a workbook laid out like the old "Computer List" sheet. Nothing
 * secret goes in: no product key (not even its last 5 characters), no remote-access IDs, no passwords.
 */
export async function exportDevices(devices: Device[], holders: DeviceHolder[]) {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Computer List", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
  const heads: [string, number][] = [
    ["Asset Number", 15],
    ["รหัสพนักงาน", 11],
    ["ผู้ถือครอง", 30],
    ["Department", 26],
    ["Studio / ทีม", 16],
    ["ComputerName", 20],
    ["Type", 12],
    ["สถานะ", 10],
    ["Buy Date", 12],
    ["ราคา", 12],
    ["หมดประกัน", 12],
    ["OS", 26],
    ["OS Version", 22],
    ["Activated", 10],
    ["License", 13],
    ["Brand", 16],
    ["Model", 26],
    ["Serial No.", 18],
    ["Mac-address", 19],
    ["MainBoard", 24],
    ["CPU", 36],
    ["Ram", 24],
    ["Graphic Card", 30],
    ["Hardisk", 22],
    ["พื้นที่ว่าง", 28],
    ["IP", 15],
    ["Login ล่าสุด", 24],
    ["Online", 9],
    ["ส่งข้อมูลล่าสุด", 17],
    ["Agent", 8],
    ["หมายเหตุ", 30],
    ["เอกสารแนบ", 40],
  ];
  heads.forEach(([title, width], i) => {
    sheet.getColumn(i + 1).width = width;
    const cell = sheet.getCell(1, i + 1);
    cell.value = title;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
  });
  const sorted = [...devices].sort((a, b) => a.computerName.localeCompare(b.computerName));
  for (const d of sorted) {
    const h = holders.find((x) => x.id === d.holderId);
    const type = typeOf(d);
    const row = sheet.addRow([
      d.assetNumber || null,
      h?.code ?? null,
      h ? `${h.name}${h.nickname ? ` (${h.nickname})` : ""}` : d.holderName || null,
      h?.department || null,
      h?.team || null,
      d.computerName || null,
      type ? DEVICE_TYPES[type] : null,
      DEVICE_STATUS[d.status].label,
      day(d.purchaseDate),
      d.purchasePrice,
      day(d.warrantyExpire),
      d.osName || null,
      d.osVersion || null,
      d.osActivated === null ? null : d.osActivated ? "Yes" : "No",
      d.osLicenseChannel ? channelLabel(d.osLicenseChannel) : null,
      d.manufacturer || null,
      d.model || null,
      d.serialNumber || null,
      d.macAddress || null,
      d.mainboard || null,
      d.cpu || null,
      d.ramText || null,
      d.gpu || null,
      d.disks.length
        ? d.disks.map((x) => `${x.type} ${diskSize(x.sizeGb)}`.trim()).join(" + ")
        : d.diskText || null,
      d.volumes.length
        ? d.volumes
            .map((v) => `${v.drive} ${Math.round(v.freeGb ?? 0)}/${Math.round(v.totalGb ?? 0)} GB`)
            .join(", ")
        : d.diskFreeGb !== null
          ? `C: ${Math.round(d.diskFreeGb)}/${Math.round(d.diskTotalGb ?? 0)} GB`
          : null,
      d.ipAddress || null,
      d.loginUser || d.lastLoginUser || null,
      d.agentStatus === "none" ? null : isOnline(d) ? "Online" : "Offline",
      d.lastSeenAt ? new Date(d.lastSeenAt) : null,
      d.agentVersion || null,
      d.remark || null,
      d.documentUrl ? { text: "เปิดเอกสาร", hyperlink: d.documentUrl } : null,
    ]);
    row.getCell(9).numFmt = row.getCell(11).numFmt = "dd/mm/yyyy";
    row.getCell(10).numFmt = "#,##0.00";
    row.getCell(29).numFmt = "dd/mm/yyyy hh:mm";
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: heads.length } };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()]));
  link.download = `computer-list-${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}
