import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  disksText,
  loginKey,
  TRACKED_FIELDS,
  typeOf,
  type AgentStatus,
  type Device,
  type DeviceChange,
  type DeviceHandover,
  type DeviceHolder,
  type DeviceHolding,
  type DeviceHoldingInput,
  type DeviceInput,
  type DeviceProgram,
  type HoldingMatch,
  type DeviceStatus,
  type DeviceType,
} from "../devices";
import { DEPARTMENTS } from "../constants";
import { HttpError } from "./errors";
import { db } from "./supabase";

/**
 * The computer register (IT Assets): `devices`, `device_software` and `device_logins`.
 * Computers enrol and report through /api/agent/*, with the enrolment key (DEVICE_ENROLL_KEY)
 * once and then their own token, of which only the SHA-256 is stored.
 */

type Row = Record<string, unknown> & { id: string };

function check<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) {
    if (result.error.code === "23505" && /asset_number/.test(result.error.message)) {
      throw new HttpError(400, "เลขครุภัณฑ์นี้มีเครื่องอื่นใช้อยู่แล้ว");
    }
    throw new Error(result.error.message);
  }
  return result.data;
}

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const str = (value: unknown) => (typeof value === "string" ? value : "");
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const toDevice = (r: Row): Device => ({
  id: r.id,
  assetNumber: (r.asset_number as string | null) ?? null,
  deviceType: str(r.device_type) as DeviceType,
  holderId: (r.holder_id as string | null) ?? null,
  holderName: str(r.holder_name),
  purchaseDate: (r.purchase_date as string | null) ?? null,
  purchaseDoc: str(r.purchase_doc),
  purchasePrice: num(r.purchase_price),
  vendor: str(r.vendor),
  warrantyExpire: (r.warranty_expire as string | null) ?? null,
  status: str(r.status) as DeviceStatus,
  remark: str(r.remark),
  computerName: str(r.computer_name),
  serialNumber: str(r.serial_number),
  manufacturer: str(r.manufacturer),
  model: str(r.model),
  chassis: str(r.chassis) as Device["chassis"],
  cpu: str(r.cpu),
  cpuCores: num(r.cpu_cores),
  ramText: str(r.ram_text),
  ramGb: num(r.ram_gb),
  disks: list(r.disks),
  diskText: str(r.disk_text),
  diskTotalGb: num(r.disk_total_gb),
  diskFreeGb: num(r.disk_free_gb),
  volumes: list(r.volumes),
  gpu: str(r.gpu),
  gpuMemoryGb: num(r.gpu_memory_gb),
  monitors: list(r.monitors),
  batteryHealth: num(r.battery_health),
  mainboard: str(r.mainboard),
  biosVersion: str(r.bios_version),
  biosDate: (r.bios_date as string | null) ?? null,
  osName: str(r.os_name),
  osVersion: str(r.os_version),
  osInstallDate: (r.os_install_date as string | null) ?? null,
  osActivated: (r.os_activated as boolean | null) ?? null,
  osPartialKey: str(r.os_partial_key),
  osLicenseChannel: str(r.os_license_channel),
  osLicenseStatus: num(r.os_license_status),
  osBiosKey: (r.os_bios_key as boolean | null) ?? null,
  osBiosKeyMatch: (r.os_bios_key_match as boolean | null) ?? null,
  lastUpdateAt: (r.last_update_at as string | null) ?? null,
  lastBootAt: (r.last_boot_at as string | null) ?? null,
  ipAddress: str(r.ip_address),
  macAddress: str(r.mac_address),
  network: list(r.network),
  connection: str(r.connection),
  loginUser: str(r.login_user),
  lastLoginUser: str(r.last_login_user),
  antivirus: str(r.antivirus),
  antivirusEnabled: (r.antivirus_enabled as boolean | null) ?? null,
  antivirusUpdatedAt: (r.antivirus_updated_at as string | null) ?? null,
  firewallEnabled: (r.firewall_enabled as boolean | null) ?? null,
  diskEncrypted: (r.disk_encrypted as boolean | null) ?? null,
  agentStatus: str(r.agent_status) as AgentStatus,
  agentVersion: str(r.agent_version),
  enrolledAt: (r.enrolled_at as string | null) ?? null,
  lastSeenAt: (r.last_seen_at as string | null) ?? null,
  inventoryAt: (r.inventory_at as string | null) ?? null,
  softwareAt: (r.software_at as string | null) ?? null,
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

// Everything but the token hash and the extra JSON.
const COLUMNS =
  "id, asset_number, device_type, holder_id, holder_name, purchase_date, purchase_doc, purchase_price, vendor, " +
  "warranty_expire, status, remark, computer_name, serial_number, manufacturer, model, chassis, cpu, cpu_cores, " +
  "ram_text, ram_gb, disks, disk_text, disk_total_gb, disk_free_gb, volumes, gpu, gpu_memory_gb, monitors, battery_health, " +
  "mainboard, bios_version, bios_date, os_name, os_version, os_install_date, os_activated, os_partial_key, " +
  "os_license_channel, os_license_status, os_bios_key, os_bios_key_match, last_update_at, " +
  "last_boot_at, ip_address, mac_address, network, connection, login_user, last_login_user, antivirus, " +
  "antivirus_enabled, antivirus_updated_at, firewall_enabled, disk_encrypted, agent_status, agent_version, " +
  "enrolled_at, last_seen_at, inventory_at, software_at, created_at, updated_at";

// ---------------------------------------------------------------- checking what arrives

const text = (value: unknown, max: number) =>
  typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f]/g, " ")
        .trim()
        .slice(0, max)
    : "";
function number(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : null;
}
const bool = (value: unknown) => (typeof value === "boolean" ? value : null);
function day(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}
function moment(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** What a computer sends: only the fields it sent, as columns (a heartbeat sends a few). */
function reportColumns(body: Record<string, unknown>): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  const put = (key: string, column: string, value: unknown) => {
    if (key in body) columns[column] = value;
  };
  put("computerName", "computer_name", text(body.computerName, 64));
  put("serialNumber", "serial_number", text(body.serialNumber, 64));
  put("manufacturer", "manufacturer", text(body.manufacturer, 80));
  put("model", "model", text(body.model, 120));
  put("chassis", "chassis", oneOf(body.chassis, ["", "desktop", "laptop"], ""));
  put("cpu", "cpu", text(body.cpu, 160));
  put("cpuCores", "cpu_cores", number(body.cpuCores, 1, 512));
  put("ramText", "ram_text", text(body.ramText, 80));
  put("ramGb", "ram_gb", number(body.ramGb, 0, 99999));
  // Agents before 1.0.1 also listed the USB drives plugged in at the time.
  const disks = list<Record<string, unknown>>(body.disks)
    .slice(0, 16)
    .map((d) => ({
      model: text(d?.model, 80),
      type: text(d?.type, 10),
      sizeGb: number(d?.sizeGb, 0, 1e6),
    }))
    .filter((d) => !/usb/i.test(`${d.type} ${d.model}`));
  put("disks", "disks", disks);
  put("diskText", "disk_text", "disks" in body ? disksText(disks) : text(body.diskText, 160));
  put("diskTotalGb", "disk_total_gb", number(body.diskTotalGb, 0, 1e6));
  put("diskFreeGb", "disk_free_gb", number(body.diskFreeGb, 0, 1e6));
  put(
    "volumes",
    "volumes",
    list<Record<string, unknown>>(body.volumes)
      .slice(0, 26)
      .map((v) => ({
        drive: text(v?.drive, 4),
        label: text(v?.label, 40),
        totalGb: number(v?.totalGb, 0, 1e6),
        freeGb: number(v?.freeGb, 0, 1e6),
      }))
      .filter((v) => /^[A-Z]:$/i.test(v.drive)),
  );
  put("gpu", "gpu", text(body.gpu, 200));
  put("gpuMemoryGb", "gpu_memory_gb", number(body.gpuMemoryGb, 0, 9999));
  put(
    "monitors",
    "monitors",
    list<Record<string, unknown>>(body.monitors)
      .slice(0, 8)
      .map((m) => ({ name: text(m?.name, 60), maker: text(m?.maker, 20), serial: text(m?.serial, 40) })),
  );
  put("batteryHealth", "battery_health", number(body.batteryHealth, 0, 150));
  put("mainboard", "mainboard", text(body.mainboard, 120));
  put("biosVersion", "bios_version", text(body.biosVersion, 60));
  put("biosDate", "bios_date", day(body.biosDate));
  put("osName", "os_name", text(body.osName, 80));
  put("osVersion", "os_version", text(body.osVersion, 80));
  put("osInstallDate", "os_install_date", day(body.osInstallDate));
  put("osActivated", "os_activated", bool(body.osActivated));
  // Never more than the last 5 characters of a key, whatever is sent.
  put(
    "osPartialKey",
    "os_partial_key",
    typeof body.osPartialKey === "string" && /^[A-Za-z0-9]{5}$/.test(body.osPartialKey)
      ? body.osPartialKey.toUpperCase()
      : "",
  );
  put("osLicenseChannel", "os_license_channel", text(body.osLicenseChannel, 40));
  put("osLicenseStatus", "os_license_status", number(body.osLicenseStatus, 0, 9));
  put("osBiosKey", "os_bios_key", bool(body.osBiosKey));
  put("osBiosKeyMatch", "os_bios_key_match", bool(body.osBiosKeyMatch));
  put("lastUpdateAt", "last_update_at", moment(body.lastUpdateAt));
  put("lastBootAt", "last_boot_at", moment(body.lastBootAt));
  put("ipAddress", "ip_address", text(body.ipAddress, 45));
  put("macAddress", "mac_address", text(body.macAddress, 32));
  put(
    "network",
    "network",
    list<Record<string, unknown>>(body.network)
      .slice(0, 16)
      .map((n) => ({
        name: text(n?.name, 120),
        mac: text(n?.mac, 32),
        ip: text(n?.ip, 45),
        type: text(n?.type, 10),
        up: bool(n?.up) ?? undefined,
      })),
  );
  put("connection", "connection", oneOf(body.connection, ["", "lan", "wifi", "other"], "other"));
  put("loginUser", "login_user", text(body.loginUser, 120));
  put("lastLoginUser", "last_login_user", text(body.lastLoginUser, 120));
  put("antivirus", "antivirus", text(body.antivirus, 120));
  put("antivirusEnabled", "antivirus_enabled", bool(body.antivirusEnabled));
  put("antivirusUpdatedAt", "antivirus_updated_at", moment(body.antivirusUpdatedAt));
  put("firewallEnabled", "firewall_enabled", bool(body.firewallEnabled));
  put("diskEncrypted", "disk_encrypted", bool(body.diskEncrypted));
  put("agentVersion", "agent_version", text(body.agentVersion, 20));
  return columns;
}

function programsOf(body: Record<string, unknown>): DeviceProgram[] | null {
  if (!Array.isArray(body.software)) return null;
  return (body.software as Record<string, unknown>[])
    .slice(0, 3000)
    .map((p) => ({
      name: text(p?.name, 200),
      version: text(p?.version, 60),
      publisher: text(p?.publisher, 120),
      installDate: day(p?.installDate),
    }))
    .filter((p) => p.name);
}

async function savePrograms(deviceId: string, programs: DeviceProgram[]) {
  check(await db().from("device_software").delete().eq("device_id", deviceId));
  for (let i = 0; i < programs.length; i += 500) {
    check(
      await db()
        .from("device_software")
        .insert(
          programs.slice(i, i + 500).map((p) => ({
            device_id: deviceId,
            name: p.name,
            version: p.version,
            publisher: p.publisher,
            install_date: p.installDate,
          })),
        ),
    );
  }
}

// ---------------------------------------------------------------- the agent

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** The enrolment key in install.cmd; null when DEVICE_ENROLL_KEY is not set in Vercel. */
export function enrollKey(): string | null {
  const key = process.env.DEVICE_ENROLL_KEY?.trim();
  return key && key.length >= 16 ? key : null;
}

function enrollKeyMatches(given: unknown): boolean {
  const key = enrollKey();
  if (!key) throw new HttpError(503, "ยังไม่ได้ตั้งค่า DEVICE_ENROLL_KEY");
  if (typeof given !== "string") return false;
  return timingSafeEqual(Buffer.from(sha256(given)), Buffer.from(sha256(key)));
}

// Board UUIDs and serials that many computers share (custom-built PCs).
const JUNK_UUID = /^(0{8}-|f{8}-|03000200-0400-0500-0006-000700080009)/i;
const JUNK_SERIAL =
  /^(to be filled|default string|system serial|not specified|none|n\/?a|0+|1234567890|x+)$/i;

const macsOf = (network: unknown) =>
  new Set(
    list<{ mac?: string }>(network)
      .map((n) => (n.mac ?? "").toLowerCase())
      .filter(Boolean),
  );

/**
 * First report of a computer. It is matched to the computer it was before (a reinstall: the same
 * board UUID and network card) or to one IT added by hand (the same serial); otherwise it is new.
 * It waits for IT unless it was approved before. Returns the computer's token.
 */
export async function enrollDevice(
  body: Record<string, unknown>,
): Promise<{ token: string; status: AgentStatus }> {
  if (!enrollKeyMatches(body.enrollKey)) throw new HttpError(401, "รหัสลงทะเบียนไม่ถูกต้อง");
  const columns = reportColumns(body);
  if (!columns.computer_name) throw new HttpError(400, "ไม่มีชื่อเครื่อง");
  const uuid = text(body.hardwareUuid, 64);
  const serial = String(columns.serial_number ?? "");
  const macs = macsOf(columns.network);

  let match: Row | null = null;
  let uuidTaken = false;
  if (uuid && !JUNK_UUID.test(uuid)) {
    const same = check(
      await db()
        .from("devices")
        .select(`id, agent_status, network, ${TRACKED_COLUMNS}`)
        .eq("hardware_uuid", uuid)
        .maybeSingle(),
    ) as Row | null;
    if (same) {
      const known = macsOf(same.network);
      if (known.size === 0 || macs.size === 0 || [...macs].some((m) => known.has(m))) match = same;
      else uuidTaken = true;
    }
  } else {
    uuidTaken = true;
  }
  if (!match && serial.length >= 4 && !JUNK_SERIAL.test(serial)) {
    const rows = check(
      await db()
        .from("devices")
        .select("id, agent_status, network")
        .eq("serial_number", serial)
        .eq("agent_status", "none")
        .limit(2),
    ) as Row[];
    if (rows.length === 1) match = rows[0];
  }
  if (match?.agent_status === "blocked") throw new HttpError(403, "เครื่องนี้ถูกบล็อกในทะเบียน");

  const token = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const status: AgentStatus = match?.agent_status === "approved" ? "approved" : "pending";
  const fields = {
    ...columns,
    agent_status: status,
    agent_token_hash: sha256(token),
    enrolled_at: now,
    last_seen_at: now,
    inventory_at: now,
    updated_at: now,
  };
  let id: string;
  if (match) {
    id = match.id;
    if (match.agent_status !== "none") await recordChanges(match, columns);
    check(
      await db()
        .from("devices")
        .update({ ...fields, ...(uuidTaken ? {} : { hardware_uuid: uuid }) })
        .eq("id", id),
    );
  } else {
    const created = check(
      await db()
        .from("devices")
        .insert({ ...fields, hardware_uuid: uuidTaken ? null : uuid })
        .select("id")
        .single(),
    ) as { id: string };
    id = created.id;
  }
  const programs = programsOf(body);
  if (programs) {
    await savePrograms(id, programs);
    check(await db().from("devices").update({ software_at: now }).eq("id", id));
  }
  return { token, status };
}

/** A later report: a heartbeat, or the full inventory, with or without the program list. */
export async function reportDevice(
  authorization: string | null,
  body: Record<string, unknown>,
): Promise<{ status: AgentStatus }> {
  const token = authorization?.match(/^Bearer\s+([A-Za-z0-9_-]{20,100})$/)?.[1];
  if (!token) throw new HttpError(401, "ไม่มี token");
  const device = check(
    await db()
      .from("devices")
      .select(`id, agent_status, hardware_uuid, ${TRACKED_COLUMNS}`)
      .eq("agent_token_hash", sha256(token))
      .maybeSingle(),
  ) as Row | null;
  if (!device) throw new HttpError(401, "token ไม่ถูกต้อง");
  if (device.agent_status === "blocked") throw new HttpError(403, "เครื่องนี้ถูกบล็อกในทะเบียน");
  // Another computer with this computer's token (a cloned disk, or the SSD moved to a new
  // computer): refused, so it enrols as a computer of its own and this one's data stays its own.
  const uuid = text(body.hardwareUuid, 64);
  const known = typeof device.hardware_uuid === "string" ? device.hardware_uuid : "";
  if (uuid && known && !JUNK_UUID.test(uuid) && uuid.toLowerCase() !== known.toLowerCase()) {
    throw new HttpError(401, "token นี้เป็นของเครื่องอื่น: ลงทะเบียนใหม่");
  }

  const now = new Date().toISOString();
  const columns = reportColumns(body);
  const programs = programsOf(body);
  await recordChanges(device, columns);
  check(
    await db()
      .from("devices")
      .update({
        ...columns,
        last_seen_at: now,
        ...("computer_name" in columns ? { inventory_at: now } : {}),
        ...(programs ? { software_at: now } : {}),
      })
      .eq("id", device.id),
  );
  if (programs) await savePrograms(device.id, programs);
  return { status: device.agent_status as AgentStatus };
}

// ---------------------------------------------------------------- what changed

const TRACKED_COLUMNS = Object.keys(TRACKED_FIELDS).join(", ");

/** Until device-changes.local.sql is run, reports are saved without the change log. */
const noChangesTable = (error: { code?: string; message: string } | null) =>
  !!error && (error.code === "42P01" || error.code === "PGRST205" || /device_changes/.test(error.message));

/** Keeps a line for each tracked field the new report has different (not for a first value). */
async function recordChanges(before: Row, columns: Record<string, unknown>): Promise<void> {
  const lines = Object.keys(TRACKED_FIELDS)
    .filter((field) => field in columns)
    .map((field) => ({
      field,
      old: String(before[field] ?? "").trim(),
      now: String(columns[field] ?? "").trim(),
    }))
    .filter((c) => c.old && c.now && c.old !== c.now)
    .map((c) => ({ device_id: before.id, field: c.field, old_value: c.old, new_value: c.now }));
  if (!lines.length) return;
  const result = await db().from("device_changes").insert(lines);
  if (!noChangesTable(result.error)) check(result);
}

export async function listChanges(deviceId: string): Promise<DeviceChange[]> {
  const result = await db()
    .from("device_changes")
    .select("id, field, old_value, new_value, changed_at")
    .eq("device_id", deviceId)
    .order("changed_at", { ascending: false })
    .limit(200);
  if (noChangesTable(result.error)) return [];
  return (check(result) as Row[]).map((r) => ({
    id: r.id,
    field: str(r.field),
    oldValue: str(r.old_value),
    newValue: str(r.new_value),
    changedAt: str(r.changed_at),
  }));
}

// ---------------------------------------------------------------- the register (IT)

export async function listDevices(): Promise<Device[]> {
  const rows = check(await db().from("devices").select(COLUMNS).order("computer_name")) as unknown as Row[];
  return rows.map(toDevice);
}

/** Employees to give computers to, with the sign-in names known to be theirs. */
export async function listHolders(): Promise<DeviceHolder[]> {
  const people = check(
    await db().from("employees").select("id, code, name, nickname, team, department_id").order("code"),
  ) as {
    id: string;
    code: string;
    name: string;
    nickname: string;
    team: string;
    department_id: string | null;
  }[];
  const logins = check(await db().from("device_logins").select("login_name, employee_id")) as {
    login_name: string;
    employee_id: string | null;
  }[];
  return people.map(({ department_id, ...p }) => ({
    ...p,
    department: DEPARTMENTS.find((d) => d.id === department_id)?.name ?? "",
    logins: logins.filter((l) => l.employee_id === p.id).map((l) => l.login_name),
  }));
}

export async function listPrograms(id: string): Promise<DeviceProgram[]> {
  const rows = check(
    await db()
      .from("device_software")
      .select("name, version, publisher, install_date")
      .eq("device_id", id)
      .order("name"),
  ) as { name: string; version: string; publisher: string; install_date: string | null }[];
  return rows.map((r) => ({
    name: r.name,
    version: r.version,
    publisher: r.publisher,
    installDate: r.install_date,
  }));
}

/** Passwords and keys do not belong in the register. */
const SECRET = /pass\s*(word)?\s*[:=]|รหัสผ่าน\s*[:=]|\b[A-Z0-9]{5}(-[A-Z0-9]{5}){4}\b/i;

export function parseDeviceInput(body: Record<string, unknown>): DeviceInput {
  const price = body.purchasePrice;
  const purchasePrice =
    price === null || price === undefined || price === ""
      ? null
      : number(typeof price === "string" ? price.replace(/,/g, "") : price, 0, 1e9);
  if (price !== null && price !== undefined && price !== "" && purchasePrice === null) {
    throw new HttpError(400, "ราคาไม่ถูกต้อง");
  }
  const input: DeviceInput = {
    assetNumber: text(body.assetNumber, 40),
    deviceType: oneOf<DeviceType>(body.deviceType, ["", "workstation", "notebook", "macbook", "other"], ""),
    holderId: typeof body.holderId === "string" && body.holderId ? body.holderId : null,
    holderName: text(body.holderName, 120),
    purchaseDate: day(body.purchaseDate),
    purchaseDoc: text(body.purchaseDoc, 120),
    purchasePrice,
    vendor: text(body.vendor, 120),
    warrantyExpire: day(body.warrantyExpire),
    status: oneOf<DeviceStatus>(body.status, ["active", "spare", "repair", "retired"], "active"),
    remark: text(body.remark, 500),
    computerName: text(body.computerName, 64),
    serialNumber: text(body.serialNumber, 64),
    manufacturer: text(body.manufacturer, 80),
    model: text(body.model, 120),
    cpu: text(body.cpu, 160),
    ramText: text(body.ramText, 80),
    diskText: text(body.diskText, 160),
    gpu: text(body.gpu, 200),
    osName: text(body.osName, 80),
  };
  if ([input.remark, input.purchaseDoc, input.holderName].some((t) => SECRET.test(t))) {
    throw new HttpError(400, "อย่าเก็บรหัสผ่านหรือ Product Key ในทะเบียน ให้เก็บใน Password Manager แทน");
  }
  return input;
}

function registerColumns(input: DeviceInput) {
  return {
    asset_number: input.assetNumber || null,
    device_type: input.deviceType,
    holder_id: input.holderId,
    holder_name: input.holderId ? "" : input.holderName,
    purchase_date: input.purchaseDate,
    purchase_doc: input.purchaseDoc,
    purchase_price: input.purchasePrice,
    vendor: input.vendor,
    warranty_expire: input.warrantyExpire,
    status: input.status,
    remark: input.remark,
  };
}

const specColumns = (input: DeviceInput) => ({
  computer_name: input.computerName,
  serial_number: input.serialNumber,
  manufacturer: input.manufacturer,
  model: input.model,
  cpu: input.cpu,
  ram_text: input.ramText,
  disk_text: input.diskText,
  gpu: input.gpu,
  os_name: input.osName,
});

/** A computer without the agent. */
export async function createDevice(
  input: DeviceInput,
  actorId: string,
  handover: DeviceHandover = { date: null, note: "" },
): Promise<void> {
  if (!input.computerName && !input.assetNumber)
    throw new HttpError(400, "กรุณากรอกชื่อเครื่องหรือเลขครุภัณฑ์");
  const row = check(
    await db()
      .from("devices")
      .insert({
        ...registerColumns(input),
        ...specColumns(input),
        agent_status: "none",
        updated_by: actorId,
      })
      .select("id")
      .single(),
  ) as { id: string };
  if (input.holderId || input.holderName.trim()) await recordHolder(row.id, input, handover, actorId);
}

async function getDevice(id: string): Promise<Device> {
  const row = check(
    await db().from("devices").select(COLUMNS).eq("id", id).maybeSingle(),
  ) as unknown as Row | null;
  if (!row) throw new HttpError(404, "ไม่พบเครื่องนี้ กรุณาโหลดหน้าใหม่");
  return toDevice(row);
}

// ---------------------------------------------------------------- who has held it

/** Until device-history.local.sql is run, the register works without the history. */
const noHistoryTable = (error: { code?: string; message: string } | null) =>
  !!error &&
  (error.code === "42P01" || error.code === "PGRST205" || /device_holder_history/.test(error.message));

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

export async function listHoldings(deviceId: string): Promise<DeviceHolding[]> {
  const result = await db()
    .from("device_holder_history")
    .select("id, holder_id, holder_code, holder_name, department, team, start_date, end_date, note")
    .eq("device_id", deviceId)
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (noHistoryTable(result.error)) return [];
  return (check(result) as Row[]).map((r) => ({
    id: r.id,
    holderId: (r.holder_id as string | null) ?? null,
    holderCode: str(r.holder_code),
    holderName: str(r.holder_name),
    department: str(r.department),
    team: str(r.team),
    startDate: str(r.start_date),
    endDate: (r.end_date as string | null) ?? null,
    note: str(r.note),
  }));
}

export function parseHandover(value: unknown): DeviceHandover {
  const body = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const note = text(body.note, 200);
  if (SECRET.test(note)) throw new HttpError(400, "อย่าเก็บรหัสผ่านหรือ Product Key ในทะเบียน");
  return { date: day(body.date), note };
}

/**
 * The holder changed: the previous holder's row ends on the handover day and the new holder's row
 * starts on it, with their name, department and studio as they are today.
 */
async function recordHolder(
  deviceId: string,
  holder: { holderId: string | null; holderName: string },
  handover: DeviceHandover,
  actorId: string,
): Promise<void> {
  const date = handover.date ?? today();
  const closed = await db()
    .from("device_holder_history")
    .update({ end_date: date })
    .eq("device_id", deviceId)
    .is("end_date", null);
  if (noHistoryTable(closed.error)) return;
  check(closed);
  if (!holder.holderId && !holder.holderName.trim()) return;

  let person = { code: "", name: holder.holderName.trim(), department: "", team: "" };
  if (holder.holderId) {
    const e = check(
      await db()
        .from("employees")
        .select("code, name, nickname, team, department_id")
        .eq("id", holder.holderId)
        .maybeSingle(),
    ) as { code: string; name: string; nickname: string; team: string; department_id: string | null } | null;
    if (!e) throw new HttpError(400, "ไม่พบพนักงานที่เลือก");
    person = {
      code: e.code,
      name: `${e.name}${e.nickname ? ` (${e.nickname})` : ""}`,
      department: DEPARTMENTS.find((d) => d.id === e.department_id)?.name ?? "",
      team: e.team,
    };
  }
  check(
    await db().from("device_holder_history").insert({
      device_id: deviceId,
      holder_id: holder.holderId,
      holder_code: person.code,
      holder_name: person.name,
      department: person.department,
      team: person.team,
      start_date: date,
      note: handover.note,
      created_by: actorId,
    }),
  );
}

/** Removes a line typed by mistake (the computer's current holder is not changed). */
export async function deleteHolding(deviceId: string, holdingId: string): Promise<void> {
  const result = await db()
    .from("device_holder_history")
    .delete()
    .eq("id", holdingId)
    .eq("device_id", deviceId);
  if (noHistoryTable(result.error)) throw new HttpError(400, "ยังไม่ได้รัน device-history.local.sql");
  check(result);
}

export function parseHoldingInput(body: Record<string, unknown>): DeviceHoldingInput {
  const input: DeviceHoldingInput = {
    holderName: text(body.holderName, 120),
    department: text(body.department, 80),
    team: text(body.team, 80),
    startDate: day(body.startDate),
    endDate: day(body.endDate),
    note: text(body.note, 200),
  };
  if (!input.holderName) throw new HttpError(400, "กรุณากรอกชื่อผู้ถือครอง");
  if (!input.startDate) throw new HttpError(400, "กรุณาระบุวันที่เริ่มถือครอง");
  if (input.endDate && input.endDate < input.startDate)
    throw new HttpError(400, "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม");
  if (SECRET.test(input.note)) throw new HttpError(400, "อย่าเก็บรหัสผ่านหรือ Product Key ในทะเบียน");
  return input;
}

/**
 * A line typed in by hand, e.g. someone who held the computer before the register and has left.
 * It only adds to the history; the computer's current holder is not changed.
 */
export async function addHolding(
  deviceId: string,
  input: DeviceHoldingInput,
  actorId: string,
): Promise<void> {
  await getDevice(deviceId);
  const result = await db().from("device_holder_history").insert({
    device_id: deviceId,
    holder_id: null,
    holder_code: "",
    holder_name: input.holderName,
    department: input.department,
    team: input.team,
    start_date: input.startDate,
    end_date: input.endDate,
    note: input.note,
    created_by: actorId,
  });
  if (noHistoryTable(result.error)) throw new HttpError(400, "ยังไม่ได้รัน device-history.local.sql");
  check(result);
}

/** Every line of the history whose person matches `query` (name, nickname or code). */
export async function searchHoldings(query: string): Promise<HoldingMatch[]> {
  const words = query
    .trim()
    .replace(/[%_,()*\.:"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (words.length < 2) return [];
  const result = await db()
    .from("device_holder_history")
    .select(
      "id, holder_id, holder_code, holder_name, department, team, start_date, end_date, note, device_id, " +
        "devices(computer_name, asset_number, holder_id, holder_name)",
    )
    .or(`holder_name.ilike.*${words}*,holder_code.ilike.*${words}*`)
    .order("start_date", { ascending: false })
    .limit(200);
  if (noHistoryTable(result.error)) return [];
  return (check(result) as unknown as Row[]).map((r) => {
    const d = (r.devices ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      holderId: (r.holder_id as string | null) ?? null,
      holderCode: str(r.holder_code),
      holderName: str(r.holder_name),
      department: str(r.department),
      team: str(r.team),
      startDate: str(r.start_date),
      endDate: (r.end_date as string | null) ?? null,
      note: str(r.note),
      deviceId: str(r.device_id),
      computerName: str(d.computer_name),
      assetNumber: str(d.asset_number),
      currentHolderId: (d.holder_id as string | null) ?? null,
      currentHolderName: str(d.holder_name),
    };
  });
}

// Sign-in names that are not one person's.
const SHARED_LOGIN = /^(administrator|admin|user|owner|guest|default|it|support|ws-it|staff)$/;

/**
 * Saves the register part (the specification too for a computer without the agent). `approve`
 * accepts a computer that is waiting. Giving it to someone records its signed-in user as theirs.
 */
export async function updateDevice(
  id: string,
  input: DeviceInput,
  actorId: string,
  approve: boolean,
  handover: DeviceHandover = { date: null, note: "" },
): Promise<void> {
  const device = await getDevice(id);
  const now = new Date().toISOString();
  check(
    await db()
      .from("devices")
      .update({
        ...registerColumns({ ...input, deviceType: input.deviceType || typeOf(device) }),
        ...(device.agentStatus === "none" ? specColumns(input) : {}),
        ...(approve && device.agentStatus === "pending" ? { agent_status: "approved" } : {}),
        updated_by: actorId,
        updated_at: now,
      })
      .eq("id", id),
  );
  const holderName = input.holderId ? "" : input.holderName.trim();
  if (input.holderId !== device.holderId || (!input.holderId && holderName !== device.holderName.trim())) {
    await recordHolder(id, { holderId: input.holderId, holderName }, handover, actorId);
  }
  const login = loginKey(device.loginUser || device.lastLoginUser);
  if (input.holderId && input.holderId !== device.holderId && login && !SHARED_LOGIN.test(login)) {
    check(
      await db()
        .from("device_logins")
        .upsert({ login_name: login, employee_id: input.holderId, confirmed_at: now, confirmed_by: actorId }),
    );
  }
}

/** Blocks a computer (its reports are refused) or lets it report again. */
export async function setAgentStatus(
  id: string,
  status: "approved" | "blocked",
  actorId: string,
): Promise<void> {
  const device = await getDevice(id);
  if (device.agentStatus === "none") throw new HttpError(400, "เครื่องนี้ไม่ได้ติดตั้ง agent");
  check(
    await db()
      .from("devices")
      .update({ agent_status: status, updated_by: actorId, updated_at: new Date().toISOString() })
      .eq("id", id),
  );
}

/** Removes the computer and its program list; if its agent reports again, it enrols as new. */
export async function deleteDevice(id: string): Promise<void> {
  await getDevice(id);
  check(await db().from("devices").delete().eq("id", id));
}
