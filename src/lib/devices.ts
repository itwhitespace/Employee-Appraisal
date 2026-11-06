/**
 * IT Assets, phase 2: the computer register. Shared by the browser and the server.
 * Computers enrol themselves through the agent (install.cmd) and wait for IT to approve them and
 * give them to someone; a computer without the agent can be added by hand.
 */

export type DeviceType = "" | "workstation" | "notebook" | "macbook" | "other";
export type DeviceStatus = "active" | "spare" | "repair" | "retired";
export type AgentStatus = "none" | "pending" | "approved" | "blocked";

export interface DiskInfo {
  model: string;
  type: string;
  sizeGb: number | null;
}
/** A drive on the disks: C:, D:, … */
export interface VolumeInfo {
  drive: string;
  label: string;
  totalGb: number | null;
  freeGb: number | null;
}
export interface MonitorInfo {
  name: string;
  maker: string;
  serial: string;
}
export interface NetworkInfo {
  name: string;
  mac: string;
  ip: string;
  type: string;
  up?: boolean;
}

export interface Device {
  id: string;
  // Register
  assetNumber: string | null;
  deviceType: DeviceType;
  holderId: string | null;
  holderName: string;
  purchaseDate: string | null;
  purchaseDoc: string;
  /** A link to the documents (bill, warranty, …), e.g. a Google Drive folder; "" when none. */
  documentUrl: string;
  purchasePrice: number | null;
  vendor: string;
  warrantyExpire: string | null;
  status: DeviceStatus;
  remark: string;
  // 1. Identity
  computerName: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  chassis: "" | "desktop" | "laptop";
  // 2. Hardware
  cpu: string;
  cpuCores: number | null;
  ramText: string;
  ramGb: number | null;
  disks: DiskInfo[];
  diskText: string;
  diskTotalGb: number | null;
  diskFreeGb: number | null;
  volumes: VolumeInfo[];
  gpu: string;
  gpuMemoryGb: number | null;
  monitors: MonitorInfo[];
  batteryHealth: number | null;
  mainboard: string;
  biosVersion: string;
  biosDate: string | null;
  // 3. Operating system
  osName: string;
  osVersion: string;
  osInstallDate: string | null;
  osActivated: boolean | null;
  /** Only the last 5 characters of the Windows key. */
  osPartialKey: string;
  /** "OEM", "Retail", "Volume:MAK", "Volume:KMS", … */
  osLicenseChannel: string;
  /** Windows' licence status: 0 unlicensed, 1 licensed, 2–6 grace periods / notification. */
  osLicenseStatus: number | null;
  /** The computer has a Windows key in its firmware. */
  osBiosKey: boolean | null;
  /** The key in use is that firmware key. */
  osBiosKeyMatch: boolean | null;
  lastUpdateAt: string | null;
  lastBootAt: string | null;
  // 4. Network
  ipAddress: string;
  macAddress: string;
  network: NetworkInfo[];
  connection: string;
  // 5. User
  loginUser: string;
  lastLoginUser: string;
  // 7. Security
  antivirus: string;
  antivirusEnabled: boolean | null;
  antivirusUpdatedAt: string | null;
  firewallEnabled: boolean | null;
  diskEncrypted: boolean | null;
  // 8. Agent
  agentStatus: AgentStatus;
  agentVersion: string;
  enrolledAt: string | null;
  lastSeenAt: string | null;
  inventoryAt: string | null;
  softwareAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What IT types in: the register, plus the specification of a computer without the agent. */
export interface DeviceInput {
  assetNumber: string;
  deviceType: DeviceType;
  holderId: string | null;
  holderName: string;
  purchaseDate: string | null;
  purchaseDoc: string;
  /** A link to the documents (bill, warranty, …), e.g. a Google Drive folder; "" when none. */
  documentUrl: string;
  purchasePrice: number | null;
  vendor: string;
  warrantyExpire: string | null;
  status: DeviceStatus;
  remark: string;
  // Only kept for computers without the agent; the agent's report replaces them otherwise.
  computerName: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  cpu: string;
  ramText: string;
  diskText: string;
  gpu: string;
  osName: string;
}

export interface DeviceProgram {
  name: string;
  version: string;
  publisher: string;
  installDate: string | null;
}

/** One person's time with a computer; name, department and studio as they were then. */
export interface DeviceHolding {
  id: string;
  holderId: string | null;
  holderCode: string;
  holderName: string;
  department: string;
  team: string;
  startDate: string;
  /** null = still has it. */
  endDate: string | null;
  note: string;
}

/** A line typed into the history by hand (e.g. someone who left before the register). */
export interface DeviceHoldingInput {
  holderName: string;
  department: string;
  team: string;
  startDate: string | null;
  endDate: string | null;
  note: string;
}

/** A line of the holder history found by a search, with the computer and who has it now. */
export interface HoldingMatch extends DeviceHolding {
  deviceId: string;
  computerName: string;
  assetNumber: string;
  currentHolderId: string | null;
  currentHolderName: string;
}

/** Something about a computer its agent reported differently from before. */
export interface DeviceChange {
  id: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedAt: string;
}

/** The fields whose changes are kept, and their names on screen. */
export const TRACKED_FIELDS: Record<string, string> = {
  computer_name: "ชื่อเครื่อง",
  serial_number: "Serial",
  cpu: "CPU",
  ram_text: "RAM",
  disk_text: "Disk",
  gpu: "การ์ดจอ",
  mainboard: "เมนบอร์ด",
  os_name: "OS",
};

/** When the holder changes: the day the computer was handed over, and why. */
export interface DeviceHandover {
  date: string | null;
  note: string;
}

/** An employee to give a computer to: only what the register needs. */
export interface DeviceHolder {
  id: string;
  code: string;
  name: string;
  nickname: string;
  team: string;
  /** Department name ("3D Visualizer"), "" when none. */
  department: string;
  /** Sign-in names already known to be this person's (lower case). */
  logins: string[];
}

export const EMPTY_DEVICE: DeviceInput = {
  assetNumber: "",
  deviceType: "",
  holderId: null,
  holderName: "",
  purchaseDate: null,
  purchaseDoc: "",
  documentUrl: "",
  purchasePrice: null,
  vendor: "",
  warrantyExpire: null,
  status: "active",
  remark: "",
  computerName: "",
  serialNumber: "",
  manufacturer: "",
  model: "",
  cpu: "",
  ramText: "",
  diskText: "",
  gpu: "",
  osName: "",
};

export const DEVICE_TYPES: Record<Exclude<DeviceType, "">, string> = {
  workstation: "Workstation",
  notebook: "Notebook",
  macbook: "Macbook",
  other: "อื่น ๆ",
};

export const DEVICE_STATUS: Record<DeviceStatus, { label: string; tone: string }> = {
  active: { label: "ใช้งาน", tone: "bg-emerald-100 text-emerald-700" },
  spare: { label: "สำรอง", tone: "bg-sky-100 text-sky-700" },
  repair: { label: "ส่งซ่อม", tone: "bg-amber-100 text-amber-700" },
  retired: { label: "ปลดระวาง", tone: "bg-slate-100 text-slate-500" },
};

/** The agent reports every 10 minutes; a computer is online when it reported in the last 15. */
export const ONLINE_MINUTES = 15;

export function isOnline(device: Pick<Device, "lastSeenAt">, now = Date.now()): boolean {
  if (!device.lastSeenAt) return false;
  return now - new Date(device.lastSeenAt).getTime() <= ONLINE_MINUTES * 60_000;
}

/** "5 นาทีที่แล้ว", "3 ชม.ที่แล้ว", "12 วันที่แล้ว"; "–" when never. */
export function seenAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "–";
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  return `${Math.round(hours / 24)} วันที่แล้ว`;
}

/** The type from what the agent reported when IT has not set one. */
export function typeOf(device: Pick<Device, "deviceType" | "chassis" | "manufacturer">): DeviceType {
  if (device.deviceType) return device.deviceType;
  if (/apple/i.test(device.manufacturer)) return "macbook";
  if (device.chassis === "laptop") return "notebook";
  if (device.chassis === "desktop") return "workstation";
  return "";
}

/** "WHITESP-CE\\Somchai" → "somchai": the name part, lower case, as kept in device_logins. */
export function loginKey(login: string): string {
  return login.split("\\").pop()!.trim().toLowerCase();
}

/**
 * The employee a sign-in name most likely belongs to: one already confirmed, else the one whose
 * English name, nickname or code is in it. Null when unsure.
 */
export function guessHolder(login: string, holders: DeviceHolder[]): DeviceHolder | null {
  const key = loginKey(login);
  if (!key) return null;
  const known = holders.find((h) => h.logins.includes(key));
  if (known) return known;
  const words = (h: DeviceHolder) =>
    [h.nickname, h.code, ...h.name.split(/\s+/)]
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 3 && /^[a-z0-9.]+$/.test(w));
  const hits = holders.filter((h) => words(h).some((w) => key.includes(w)));
  return hits.length === 1 ? hits[0] : null;
}

// Sizes disks are sold as (GB, 1 GB = 1,000,000,000 bytes).
const DISK_SIZES = [
  32, 60, 64, 120, 128, 160, 240, 250, 256, 320, 480, 500, 512, 640, 750, 960, 1000, 1024, 1500, 2000, 2048,
  3000, 4000, 4096, 5000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000,
];

/**
 * The size a disk is sold as: Windows counts 1 GB as 1024³ bytes, so a 500 GB disk shows as 466.
 * "500 GB", "1 TB", "2 TB".
 */
export function diskSize(sizeGb: number | null): string {
  if (sizeGb === null || sizeGb <= 0) return "?";
  const sold = sizeGb * 1.073741824;
  const gap = (n: number) => Math.abs(sold - n) / n;
  const near = DISK_SIZES.reduce((a, b) => (gap(b) < gap(a) ? b : a));
  const gb = gap(near) <= 0.04 ? near : Math.round(sold);
  if (gb >= 1000) {
    const tb = gb % 1024 === 0 ? gb / 1024 : gb / 1000;
    return `${Number.isInteger(tb) ? tb : tb.toFixed(1)} TB`;
  }
  return `${gb} GB`;
}

/** "SSD 500 GB + HDD 1 TB" */
export const disksText = (disks: DiskInfo[]) =>
  disks.map((d) => `${d.type} ${diskSize(d.sizeGb)}`.trim()).join(" + ");

/** "XXXXX-XXXXX-XXXXX-XXXXX-3V66T": all that is kept of a Windows key. */
export const maskedKey = (partial: string) => (partial ? `XXXXX-XXXXX-XXXXX-XXXXX-${partial}` : "");

/** What each licence channel means, for the audit. */
export const LICENSE_CHANNELS: Record<string, { label: string; note: string }> = {
  OEM: { label: "OEM", note: "มากับเครื่อง ใช้ได้กับเครื่องนี้เท่านั้น" },
  Retail: { label: "Retail", note: "ซื้อแยก ย้ายเครื่องได้ ควรมีใบเสร็จ / กล่อง" },
  "Volume:MAK": { label: "Volume (MAK)", note: "License องค์กร ใช้ key เดียวได้หลายเครื่องตามสิทธิ์" },
  "Volume:KMS": { label: "Volume (KMS)", note: "ต้องมี KMS server ขององค์กร ถ้าไม่มีให้ตรวจสอบ" },
  Volume: { label: "Volume", note: "License องค์กร" },
};

export const channelLabel = (channel: string) => LICENSE_CHANNELS[channel]?.label ?? channel;

/** Windows' licence status, 0–6. */
export function licenseStatusText(status: number | null): string {
  switch (status) {
    case null:
      return "";
    case 0:
      return "ไม่มี License";
    case 1:
      return "Activated";
    case 5:
      return "แจ้งเตือน (ไม่ Activate)";
    default:
      return "อยู่ในช่วงผ่อนผัน (Grace)";
  }
}

/** "1.0.2" is older than "1.0.3"; an empty version (never reported) is not counted. */
export function isOlderVersion(version: string, latest: string): boolean {
  if (!version || !latest) return false;
  const a = version.split(".").map(Number);
  const b = latest.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/** Asset numbers like WS-131150C7: letters / digits, dashes only between them. */
const ASSET_NUMBER = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;

/**
 * What must be filled in before a computer is saved or approved: who has it (an employee, or the
 * name of the place / person when not an employee) and its asset number. Empty = nothing missing.
 */
export function registerProblems(input: Pick<DeviceInput, "holderId" | "holderName" | "assetNumber">): {
  holder?: string;
  assetNumber?: string;
} {
  const problems: { holder?: string; assetNumber?: string } = {};
  if (!input.holderId && !input.holderName.trim())
    problems.holder = "เลือกพนักงาน หรือกรอกชื่อผู้ใช้ / จุดใช้งาน";
  const asset = input.assetNumber.trim();
  if (!asset) problems.assetNumber = "กรุณากรอกเลขครุภัณฑ์";
  else if (!ASSET_NUMBER.test(asset) || asset.length < 4)
    problems.assetNumber = "เลขครุภัณฑ์ไม่ครบ (เช่น WS-131150C7)";
  return problems;
}
