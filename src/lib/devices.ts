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

/** An employee to give a computer to: only what the register needs. */
export interface DeviceHolder {
  id: string;
  code: string;
  name: string;
  nickname: string;
  team: string;
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
