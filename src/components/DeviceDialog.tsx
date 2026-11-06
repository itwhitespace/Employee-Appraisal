"use client";

import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { DiskBar } from "@/components/DiskBar";
import { api, errorMessage } from "@/lib/api";
import {
  DEVICE_STATUS,
  channelLabel,
  DEVICE_TYPES,
  diskSize,
  LICENSE_CHANNELS,
  TRACKED_FIELDS,
  maskedKey,
  EMPTY_DEVICE,
  guessHolder,
  isOnline,
  seenAgo,
  typeOf,
  type Device,
  type DeviceHolder,
  type DeviceChange,
  type DeviceHolding,
  type DeviceHoldingInput,
  type DeviceInput,
  type DeviceProgram,
  type DeviceStatus,
  type DeviceType,
} from "@/lib/devices";
import { formatDate, formatDateCE, formatDateTime } from "@/lib/format";

const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

/** "1 ปี 3 เดือน" between two days (to today when still held). */
function heldFor(start: string, end: string | null): string {
  const a = new Date(start);
  const b = end ? new Date(end) : new Date();
  let months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  if (b.getDate() < a.getDate()) months -= 1;
  if (months < 1) return `${Math.max(0, Math.round((b.getTime() - a.getTime()) / 864e5))} วัน`;
  const years = Math.floor(months / 12);
  return [years && `${years} ปี`, months % 12 && `${months % 12} เดือน`].filter(Boolean).join(" ");
}

const numberOrNull = (text: string) => (text.trim() === "" ? null : Number(text.replace(/,/g, "")));
const yesNo = (value: boolean | null, yes = "เปิด", no = "ปิด") =>
  value === null ? (
    <span className="text-faint">–</span>
  ) : value ? (
    <span className="font-medium text-emerald-700">✓ {yes}</span>
  ) : (
    <span className="font-medium text-red-600">✕ {no}</span>
  );

export const holderLabel = (h: DeviceHolder) => `${h.name}${h.nickname ? ` (${h.nickname})` : ""}`;

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

/** One heading and its label / value lines in the specification. */
function Section({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  return (
    <section>
      <h3 className="mb-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
        {title}
      </h3>
      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1 px-2 text-[12.5px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="break-words">
              {value === "" || value === null ? <span className="text-faint">–</span> : value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function inputOf(device: Device | null): DeviceInput {
  if (!device) return EMPTY_DEVICE;
  return {
    assetNumber: device.assetNumber ?? "",
    deviceType: device.deviceType || typeOf(device),
    holderId: device.holderId,
    holderName: device.holderName,
    purchaseDate: device.purchaseDate,
    purchaseDoc: device.purchaseDoc,
    documentUrl: device.documentUrl,
    purchasePrice: device.purchasePrice,
    vendor: device.vendor,
    warrantyExpire: device.warrantyExpire,
    status: device.status,
    remark: device.remark,
    computerName: device.computerName,
    serialNumber: device.serialNumber,
    manufacturer: device.manufacturer,
    model: device.model,
    cpu: device.cpu,
    ramText: device.ramText,
    diskText: device.diskText,
    gpu: device.gpu,
    osName: device.osName,
  };
}

/**
 * A computer: what its agent reported (read only) and the register part IT fills in. A computer
 * that is waiting is approved and given to someone here. `device` null = add one without the agent.
 */
export function DeviceDialog({
  device,
  holders,
  onSaved,
  onClose,
}: {
  device: Device | null;
  holders: DeviceHolder[];
  onSaved: (devices: Device[]) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const confirm = useConfirm();
  const [form, setForm] = useState<DeviceInput>(() => inputOf(device));
  const [programs, setPrograms] = useState<DeviceProgram[] | null>(null);
  const [history, setHistory] = useState<DeviceHolding[] | null>(device ? null : []);
  const [changes, setChanges] = useState<DeviceChange[]>([]);
  const [adding, setAdding] = useState<DeviceHoldingInput | null>(null);
  const [handover, setHandover] = useState({ date: todayISO(), note: "" });
  const [showPrograms, setShowPrograms] = useState(false);
  const [programSearch, setProgramSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const set = (patch: Partial<DeviceInput>) => setForm((f) => ({ ...f, ...patch }));

  const manual = !device || device.agentStatus === "none";
  const pending = device?.agentStatus === "pending";
  const login = device ? device.loginUser || device.lastLoginUser : "";
  const suggestion = login ? guessHolder(login, holders) : null;

  useEffect(() => {
    dialog.current?.showModal();
    // A waiting computer: offer the person its signed-in user most likely is.
    if (device && !device.holderId && suggestion) setForm((f) => ({ ...f, holderId: suggestion.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!device) return;
    api
      .deviceDetail(device.id)
      .then((r) => {
        setHistory(r.history);
        setChanges(r.changes);
        setPrograms(r.programs);
      })
      .catch(() => {
        setHistory([]);
        setPrograms([]);
      });
  }, [device]);

  // A new holder (or none): the history gets a line from the handover day.
  const holderChanged = device
    ? form.holderId !== device.holderId ||
      (!form.holderId && form.holderName.trim() !== device.holderName.trim())
    : !!form.holderId || !!form.holderName.trim();

  const close = () => {
    dialog.current?.close();
    onClose();
  };

  async function run(action: () => Promise<{ devices: Device[] }>) {
    setBusy(true);
    setError(null);
    try {
      onSaved((await action()).devices);
      close();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function save(approve: boolean) {
    const holder = holders.find((h) => h.id === form.holderId);
    const sure = await confirm({
      title: !device ? "เพิ่มเครื่องนี้?" : approve ? "อนุมัติเครื่องนี้เข้าทะเบียน?" : "บันทึกการแก้ไข?",
      message:
        (holder
          ? `ผู้ถือครอง: ${holderLabel(holder)}`
          : form.holderName
            ? `ผู้ถือครอง: ${form.holderName}`
            : "ยังไม่ได้ระบุผู้ถือครอง") +
        (holderChanged ? ` · บันทึกประวัติตั้งแต่ ${formatDate(handover.date || todayISO())}` : ""),
      confirmLabel: approve ? "อนุมัติ" : "บันทึก",
    });
    if (!sure) return;
    const given = holderChanged ? handover : undefined;
    await run(() => (device ? api.saveDevice(device.id, form, approve, given) : api.addDevice(form, given)));
  }

  async function block() {
    if (!device) return;
    const blocking = device.agentStatus !== "blocked";
    const sure = await confirm({
      title: blocking ? `บล็อก ${device.computerName}?` : `ปลดบล็อก ${device.computerName}?`,
      message: blocking
        ? "ระบบจะไม่รับข้อมูลจากเครื่องนี้อีก จนกว่าจะปลดบล็อก"
        : "เครื่องนี้จะส่งข้อมูลเข้าทะเบียนได้อีกครั้ง",
      confirmLabel: blocking ? "บล็อก" : "ปลดบล็อก",
      tone: blocking ? "danger" : "default",
    });
    if (sure) await run(() => api.setDeviceAgent(device.id, blocking ? "blocked" : "approved"));
  }

  async function addHolding() {
    if (!device || !adding) return;
    setError(null);
    try {
      setHistory((await api.addDeviceHolding(device.id, adding)).history);
      setAdding(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function removeHolding(h: DeviceHolding) {
    if (!device) return;
    const sure = await confirm({
      title: `ลบประวัติของ ${h.holderName || "รายการนี้"}?`,
      message: "ใช้กรณีบันทึกผิดเท่านั้น ผู้ถือครองปัจจุบันของเครื่องจะไม่เปลี่ยน",
      confirmLabel: "ลบ",
      tone: "danger",
    });
    if (!sure) return;
    try {
      setHistory((await api.deleteDeviceHolding(device.id, h.id)).history);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove() {
    if (!device) return;
    const sure = await confirm({
      title: `ลบ ${device.computerName || device.assetNumber} ออกจากทะเบียน?`,
      message:
        device.agentStatus === "none"
          ? "ลบข้อมูลเครื่องนี้ทั้งหมด"
          : "ถ้ายังไม่ได้ถอน agent (uninstall.cmd) เครื่องนี้จะลงทะเบียนเข้ามาใหม่เป็น 'รออนุมัติ' ในรอบถัดไป",
      confirmLabel: "ลบ",
      tone: "danger",
    });
    if (sure) await run(() => api.deleteDevice(device.id));
  }

  const online = device ? isOnline(device) : false;
  const shownPrograms = (programs ?? []).filter((p) =>
    `${p.name} ${p.publisher}`.toLowerCase().includes(programSearch.trim().toLowerCase()),
  );

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="w-full max-w-5xl rounded-2xl p-0 shadow-float backdrop:bg-black/30 backdrop:backdrop-blur-sm"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-4 text-white">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-semibold tracking-tight">
            {device
              ? device.computerName || device.assetNumber || "เครื่องคอมพิวเตอร์"
              : "เพิ่มเครื่องเอง (ไม่มี agent)"}
          </h2>
          <p className="text-xs text-white/80">
            {device
              ? [device.manufacturer, device.model, device.serialNumber && `S/N ${device.serialNumber}`]
                  .filter(Boolean)
                  .join(" · ") || "–"
              : "สำหรับเครื่องที่ติดตั้ง agent ไม่ได้ เช่น เครื่องเสีย หรือเครื่องสำรองที่ไม่ได้เปิด"}
          </p>
        </div>
        {device && device.agentStatus !== "none" && (
          <span className="chip bg-white/20 text-white">
            <span
              className={`mr-1.5 inline-block h-2 w-2 rounded-full ${online ? "bg-lime-300" : "bg-white/50"}`}
            />
            {online ? "Online" : "Offline"} · {seenAgo(device.lastSeenAt)}
          </span>
        )}
      </header>

      <div className="grid max-h-[72vh] gap-6 overflow-y-auto px-6 py-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ---------------------------------------------- what the agent reported */}
        <div className="space-y-4">
          {device && device.agentStatus !== "none" ? (
            <>
              <Section
                title="1. ตัวเครื่อง"
                rows={[
                  ["ชื่อเครื่อง", device.computerName],
                  ["ยี่ห้อ / รุ่น", [device.manufacturer, device.model].filter(Boolean).join(" ")],
                  ["Serial", device.serialNumber],
                  [
                    "ประเภท",
                    device.chassis === "laptop" ? "Laptop" : device.chassis === "desktop" ? "Desktop" : "",
                  ],
                  [
                    "BIOS",
                    [device.biosVersion, device.biosDate && formatDateCE(device.biosDate)]
                      .filter(Boolean)
                      .join(" · "),
                  ],
                ]}
              />
              <Section
                title="2. ฮาร์ดแวร์"
                rows={[
                  [
                    "CPU",
                    device.cpu && `${device.cpu}${device.cpuCores ? ` · ${device.cpuCores} cores` : ""}`,
                  ],
                  ["RAM", device.ramText],
                  [
                    "Disk",
                    device.disks.length
                      ? device.disks
                          .map((d) => `${d.type} ${diskSize(d.sizeGb)} · ${d.model}`.trim())
                          .join(" + ")
                      : device.diskText,
                  ],
                  [
                    "พื้นที่ว่าง",
                    device.diskFreeGb === null && !device.volumes.length ? (
                      ""
                    ) : (
                      <DiskBar device={device} wide />
                    ),
                  ],
                  [
                    "การ์ดจอ",
                    device.gpu && `${device.gpu}${device.gpuMemoryGb ? ` · ${device.gpuMemoryGb} GB` : ""}`,
                  ],
                  [
                    "จอภาพ",
                    device.monitors
                      .map((m) => m.name || m.maker)
                      .filter(Boolean)
                      .join(", "),
                  ],
                  ["แบตเตอรี่", device.batteryHealth === null ? "" : `สุขภาพ ${device.batteryHealth}%`],
                  ["เมนบอร์ด", device.mainboard],
                ]}
              />
              <Section
                title="3. ระบบปฏิบัติการ"
                rows={[
                  ["OS", [device.osName, device.osVersion].filter(Boolean).join(" ")],
                  ["Activated", yesNo(device.osActivated, "Activated", "ยังไม่ Activate")],
                  [
                    "License",
                    device.osLicenseChannel && (
                      <>
                        {channelLabel(device.osLicenseChannel)}
                        {LICENSE_CHANNELS[device.osLicenseChannel] && (
                          <span className="text-muted">
                            {" "}
                            · {LICENSE_CHANNELS[device.osLicenseChannel].note}
                          </span>
                        )}
                      </>
                    ),
                  ],
                  [
                    "Product Key",
                    device.osPartialKey && (
                      <span className="font-mono text-[12px]">{maskedKey(device.osPartialKey)}</span>
                    ),
                  ],
                  [
                    "Key ใน BIOS",
                    device.osBiosKey === null
                      ? ""
                      : !device.osBiosKey
                        ? "ไม่มี"
                        : device.osBiosKeyMatch
                          ? "มี · ตรงกับที่ใช้อยู่"
                          : "มี · แต่ใช้ key อื่นอยู่",
                  ],
                  ["ติดตั้งเมื่อ", device.osInstallDate ? formatDate(device.osInstallDate) : ""],
                  ["อัปเดตล่าสุด", device.lastUpdateAt ? formatDate(device.lastUpdateAt) : ""],
                  ["เปิดเครื่องล่าสุด", device.lastBootAt ? formatDateTime(device.lastBootAt) : ""],
                ]}
              />
              <Section
                title="4. เครือข่าย"
                rows={[
                  [
                    "IP",
                    device.ipAddress &&
                      `${device.ipAddress} (${device.connection === "wifi" ? "Wi-Fi" : "LAN"})`,
                  ],
                  ["MAC", device.macAddress],
                  [
                    "การ์ดแลน",
                    device.network.length
                      ? device.network
                          .map((n) => `${n.type === "wifi" ? "Wi-Fi" : "LAN"}: ${n.name}`)
                          .join(", ")
                      : "",
                  ],
                ]}
              />
              <Section
                title="5. ผู้ใช้งาน"
                rows={[
                  ["Login อยู่", device.loginUser],
                  ["Login ล่าสุด", device.lastLoginUser],
                ]}
              />
              <Section
                title="7. ความปลอดภัย"
                rows={[
                  [
                    "Antivirus",
                    device.antivirus ? (
                      <>
                        {device.antivirus} · {yesNo(device.antivirusEnabled)}
                        {device.antivirusUpdatedAt && (
                          <span className="text-muted">
                            {" "}
                            · อัปเดต {formatDate(device.antivirusUpdatedAt)}
                          </span>
                        )}
                      </>
                    ) : (
                      ""
                    ),
                  ],
                  ["Firewall", yesNo(device.firewallEnabled)],
                  ["เข้ารหัส Disk", yesNo(device.diskEncrypted)],
                ]}
              />
              <Section
                title="8. Agent"
                rows={[
                  [
                    "ส่งข้อมูลล่าสุด",
                    device.lastSeenAt
                      ? `${formatDateTime(device.lastSeenAt)} (${seenAgo(device.lastSeenAt)})`
                      : "",
                  ],
                  ["ข้อมูลเต็มล่าสุด", device.inventoryAt ? formatDateTime(device.inventoryAt) : ""],
                  ["ลงทะเบียนเมื่อ", device.enrolledAt ? formatDateTime(device.enrolledAt) : ""],
                  ["เวอร์ชัน", device.agentVersion],
                ]}
              />
              <section>
                <button
                  type="button"
                  className="w-full rounded-md bg-emerald-50 px-2 py-1 text-left text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  onClick={() => setShowPrograms((v) => !v)}
                  aria-expanded={showPrograms}
                >
                  {showPrograms ? "▾" : "▸"} 6. โปรแกรมที่ติดตั้ง
                  {device.softwareAt && (
                    <span className="font-normal text-emerald-700/70">
                      {" "}
                      · อัปเดต {formatDateTime(device.softwareAt)}
                    </span>
                  )}
                </button>
                {showPrograms && (
                  <div className="mt-2 px-2">
                    {programs === null ? (
                      <p className="text-xs text-muted">กำลังโหลด…</p>
                    ) : programs.length === 0 ? (
                      <p className="text-xs text-muted">ยังไม่มีรายการ</p>
                    ) : (
                      <>
                        <input
                          className="field mb-2 !py-1 text-xs"
                          placeholder={`ค้นหาใน ${programs.length} โปรแกรม…`}
                          value={programSearch}
                          onChange={(e) => setProgramSearch(e.target.value)}
                        />
                        <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
                          <table className="sheet text-xs">
                            <thead>
                              <tr>
                                <th>โปรแกรม</th>
                                <th>เวอร์ชัน</th>
                                <th>ผู้ผลิต</th>
                                <th>ติดตั้ง</th>
                              </tr>
                            </thead>
                            <tbody>
                              {shownPrograms.map((p, i) => (
                                <tr key={`${p.name}-${p.version}-${i}`}>
                                  <td>{p.name}</td>
                                  <td className="tabular-nums">{p.version || "–"}</td>
                                  <td className="text-muted">{p.publisher || "–"}</td>
                                  <td className="whitespace-nowrap tabular-nums">
                                    {formatDate(p.installDate)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:col-span-2">
                เครื่องนี้ไม่มี agent: ข้อมูลด้านล่างกรอกเอง และจะไม่แสดงสถานะ Online / Offline
              </p>
              <Field label="ชื่อเครื่อง">
                <input
                  className="field"
                  value={form.computerName}
                  onChange={(e) => set({ computerName: e.target.value })}
                />
              </Field>
              <Field label="Serial Number">
                <input
                  className="field"
                  value={form.serialNumber}
                  onChange={(e) => set({ serialNumber: e.target.value })}
                />
              </Field>
              <Field label="ยี่ห้อ">
                <input
                  className="field"
                  value={form.manufacturer}
                  onChange={(e) => set({ manufacturer: e.target.value })}
                />
              </Field>
              <Field label="รุ่น">
                <input
                  className="field"
                  value={form.model}
                  onChange={(e) => set({ model: e.target.value })}
                />
              </Field>
              <Field label="CPU" wide>
                <input className="field" value={form.cpu} onChange={(e) => set({ cpu: e.target.value })} />
              </Field>
              <Field label="RAM">
                <input
                  className="field"
                  value={form.ramText}
                  onChange={(e) => set({ ramText: e.target.value })}
                />
              </Field>
              <Field label="Disk">
                <input
                  className="field"
                  value={form.diskText}
                  onChange={(e) => set({ diskText: e.target.value })}
                />
              </Field>
              <Field label="การ์ดจอ">
                <input className="field" value={form.gpu} onChange={(e) => set({ gpu: e.target.value })} />
              </Field>
              <Field label="OS">
                <input
                  className="field"
                  value={form.osName}
                  onChange={(e) => set({ osName: e.target.value })}
                />
              </Field>
            </div>
          )}
        </div>

        {/* ---------------------------------------------- the register */}
        <div className="space-y-3 rounded-2xl bg-canvas p-4 lg:self-start">
          <h3 className="text-sm font-semibold">ทะเบียน / ผู้ถือครอง</h3>
          {pending && (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900">
              เครื่องนี้ลงทะเบียนเข้ามาเองและรออนุมัติ: ตรวจว่าเป็นเครื่องของบริษัท เลือกผู้ถือครอง แล้วกด
              “อนุมัติ”
            </p>
          )}
          <Field label="ผู้ถือครอง (พนักงาน)">
            <select
              className="field bg-white"
              value={form.holderId ?? ""}
              onChange={(e) => set({ holderId: e.target.value || null })}
            >
              <option value="">— ไม่ระบุ / เครื่องส่วนกลาง —</option>
              {holders.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.code} · {holderLabel(h)}
                  {h.team ? ` · ${h.team}` : ""}
                </option>
              ))}
            </select>
          </Field>
          {login && (
            <p className="text-xs text-muted">
              Login: <span className="font-mono text-ink">{login}</span>
              {suggestion ? (
                form.holderId === suggestion.id ? (
                  <span className="text-emerald-700"> · ระบบเลือกให้จาก user นี้</span>
                ) : (
                  <button
                    type="button"
                    className="btn-text !px-1 text-xs"
                    onClick={() => set({ holderId: suggestion.id })}
                  >
                    ใช้ {holderLabel(suggestion)}?
                  </button>
                )
              ) : (
                <span> · ยังจับคู่กับพนักงานไม่ได้</span>
              )}
            </p>
          )}
          {!form.holderId && (
            <Field label="ชื่อผู้ใช้ / จุดใช้งาน (ถ้าไม่ใช่พนักงาน)">
              <input
                className="field bg-white"
                placeholder="เช่น เครื่องส่วนกลาง Enscape"
                value={form.holderName}
                onChange={(e) => set({ holderName: e.target.value })}
              />
            </Field>
          )}
          {holderChanged && (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="text-xs font-medium text-emerald-800">
                เปลี่ยนผู้ถือครอง: จะบันทึกลงประวัติเครื่อง
                {history?.some((h) => !h.endDate) ? " และปิดรายการของคนเดิม" : ""}
              </p>
              <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-2">
                <Field label="วันที่ส่งมอบ">
                  <input
                    type="date"
                    className="field bg-white"
                    value={handover.date}
                    max={todayISO()}
                    onChange={(e) => setHandover((h) => ({ ...h, date: e.target.value }))}
                  />
                </Field>
                <Field label="หมายเหตุ">
                  <input
                    className="field bg-white"
                    placeholder="เช่น คนเดิมลาออก / ย้ายทีม"
                    value={handover.note}
                    onChange={(e) => setHandover((h) => ({ ...h, note: e.target.value }))}
                  />
                </Field>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="เลขครุภัณฑ์">
              <input
                className="field bg-white"
                placeholder="WS-…"
                value={form.assetNumber}
                onChange={(e) => set({ assetNumber: e.target.value })}
              />
            </Field>
            <Field label="ประเภท">
              <select
                className="field bg-white"
                value={form.deviceType}
                onChange={(e) => set({ deviceType: e.target.value as DeviceType })}
              >
                <option value="">–</option>
                {Object.entries(DEVICE_TYPES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="สถานะ">
              <select
                className="field bg-white"
                value={form.status}
                onChange={(e) => set({ status: e.target.value as DeviceStatus })}
              >
                {Object.entries(DEVICE_STATUS).map(([key, s]) => (
                  <option key={key} value={key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="วันที่ซื้อ">
              <input
                type="date"
                className="field bg-white"
                value={form.purchaseDate ?? ""}
                onChange={(e) => set({ purchaseDate: e.target.value || null })}
              />
            </Field>
            <Field label="ราคา (บาท)">
              <input
                className="field bg-white tabular-nums"
                inputMode="decimal"
                value={form.purchasePrice ?? ""}
                onChange={(e) => set({ purchasePrice: numberOrNull(e.target.value) })}
              />
            </Field>
            <Field label="หมดประกัน">
              <input
                type="date"
                className="field bg-white"
                value={form.warrantyExpire ?? ""}
                onChange={(e) => set({ warrantyExpire: e.target.value || null })}
              />
            </Field>
            <Field label="เลขที่บิล / ใบสั่งซื้อ">
              <input
                className="field bg-white"
                value={form.purchaseDoc}
                onChange={(e) => set({ purchaseDoc: e.target.value })}
              />
            </Field>
            <Field label="ผู้ขาย">
              <input
                className="field bg-white"
                value={form.vendor}
                onChange={(e) => set({ vendor: e.target.value })}
              />
            </Field>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">เอกสารแนบ (ลิงก์ Google Drive)</span>
            {device?.documentUrl && !editingUrl && form.documentUrl === device.documentUrl ? (
              <div className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5">
                <a
                  href={device.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-[13px] text-accent hover:underline"
                  title={device.documentUrl}
                >
                  🔗 {device.documentUrl.replace(/^https:\/\//, "")}
                </a>
                <button
                  type="button"
                  className="shrink-0 rounded p-1 text-muted hover:bg-canvas hover:text-ink"
                  title="แก้ไขลิงก์"
                  onClick={() => setEditingUrl(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <input
                className="field bg-white"
                placeholder="https://drive.google.com/…"
                value={form.documentUrl}
                onChange={(e) => set({ documentUrl: e.target.value.trim() })}
              />
            )}
          </div>
          <Field label="หมายเหตุ (ห้ามใส่รหัสผ่าน / Product Key)">
            <textarea
              className="field min-h-[56px] bg-white"
              value={form.remark}
              onChange={(e) => set({ remark: e.target.value })}
            />
          </Field>
        </div>

        {/* ---------------------------------------------- who has held it */}
        {device && (
          <section className="lg:col-span-2">
            <h3 className="mb-2 flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
              <span className="flex-1">ประวัติผู้ถือครอง</span>
              {!adding && (
                <button
                  type="button"
                  className="btn-text !px-1 !py-0 text-xs"
                  onClick={() =>
                    setAdding({
                      holderName: "",
                      department: "",
                      team: "",
                      startDate: null,
                      endDate: null,
                      note: "",
                    })
                  }
                >
                  + เพิ่มประวัติเอง
                </button>
              )}
            </h3>
            {adding && (
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                <p className="mb-2 text-xs text-emerald-800">
                  สำหรับคนที่เคยใช้เครื่องนี้ก่อนมีระบบ หรือคนที่ลาออกไปแล้ว (ไม่เปลี่ยนผู้ถือครองปัจจุบัน)
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Field label="ชื่อผู้ถือครอง *">
                    <input
                      className="field bg-white"
                      placeholder="เช่น นาย สมชาย ใจดี (ชาย)"
                      value={adding.holderName}
                      onChange={(e) => setAdding({ ...adding, holderName: e.target.value })}
                    />
                  </Field>
                  <Field label="แผนก">
                    <input
                      className="field bg-white"
                      value={adding.department}
                      onChange={(e) => setAdding({ ...adding, department: e.target.value })}
                    />
                  </Field>
                  <Field label="Studio / ทีม">
                    <input
                      className="field bg-white"
                      value={adding.team}
                      onChange={(e) => setAdding({ ...adding, team: e.target.value })}
                    />
                  </Field>
                  <Field label="ตั้งแต่ *">
                    <input
                      type="date"
                      className="field bg-white"
                      value={adding.startDate ?? ""}
                      onChange={(e) => setAdding({ ...adding, startDate: e.target.value || null })}
                    />
                  </Field>
                  <Field label="ถึง">
                    <input
                      type="date"
                      className="field bg-white"
                      value={adding.endDate ?? ""}
                      onChange={(e) => setAdding({ ...adding, endDate: e.target.value || null })}
                    />
                  </Field>
                  <Field label="หมายเหตุ">
                    <input
                      className="field bg-white"
                      placeholder="เช่น ลาออก"
                      value={adding.note}
                      onChange={(e) => setAdding({ ...adding, note: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn-secondary !py-1 text-xs"
                    onClick={() => setAdding(null)}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    className="btn-primary !py-1 text-xs"
                    onClick={() => void addHolding()}
                  >
                    เพิ่มในประวัติ
                  </button>
                </div>
              </div>
            )}
            {history === null ? (
              <p className="px-2 text-xs text-muted">กำลังโหลด…</p>
            ) : history.length === 0 ? (
              <p className="px-2 text-xs text-muted">
                ยังไม่มีประวัติ: จะเริ่มบันทึกเมื่อเลือกผู้ถือครองแล้วกดบันทึก
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="sheet text-xs">
                  <thead>
                    <tr>
                      <th>ผู้ถือครอง</th>
                      <th>แผนก</th>
                      <th>Studio / ทีม</th>
                      <th>ตั้งแต่</th>
                      <th>ถึง</th>
                      <th>ระยะเวลา</th>
                      <th>หมายเหตุ</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className={h.endDate ? "" : "bg-emerald-50/50"}>
                        <td>
                          {h.holderCode && <span className="text-muted">{h.holderCode} · </span>}
                          {h.holderName || "–"}
                        </td>
                        <td>{h.department || "–"}</td>
                        <td>{h.team || "–"}</td>
                        <td className="whitespace-nowrap tabular-nums">{formatDate(h.startDate)}</td>
                        <td className="whitespace-nowrap tabular-nums">
                          {h.endDate ? (
                            formatDate(h.endDate)
                          ) : (
                            <span className="chip bg-emerald-100 text-emerald-800">ปัจจุบัน</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap tabular-nums">{heldFor(h.startDate, h.endDate)}</td>
                        <td className="text-muted">{h.note || "–"}</td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="btn-text !px-1 text-xs text-red-600"
                            disabled={busy}
                            onClick={() => removeHolding(h)}
                            title="ลบรายการนี้ (กรณีบันทึกผิด)"
                          >
                            ลบ
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ---------------------------------------------- what changed on it */}
        {device && changes.length > 0 && (
          <section className="lg:col-span-2">
            <h3 className="mb-2 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
              ประวัติการเปลี่ยนแปลงของเครื่อง
            </h3>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="sheet text-xs">
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>รายการ</th>
                    <th>เดิม</th>
                    <th>ใหม่</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.id}>
                      <td className="whitespace-nowrap tabular-nums">{formatDateTime(c.changedAt)}</td>
                      <td className="whitespace-nowrap font-medium">{TRACKED_FIELDS[c.field] ?? c.field}</td>
                      <td className="text-muted line-through decoration-slate-300">{c.oldValue}</td>
                      <td>{c.newValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {error && <p className="px-6 pb-2 text-sm text-red-500">{error}</p>}
      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">
        {device && (
          <>
            <button type="button" className="btn-text text-xs text-red-600" disabled={busy} onClick={remove}>
              ลบ
            </button>
            {!manual && (
              <button type="button" className="btn-text text-xs" disabled={busy} onClick={block}>
                {device.agentStatus === "blocked" ? "ปลดบล็อก" : "บล็อก"}
              </button>
            )}
          </>
        )}
        <span className="flex-1" />
        <button type="button" className="btn-secondary" disabled={busy} onClick={close}>
          ปิด
        </button>
        {pending ? (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => save(true)}>
            อนุมัติ + บันทึก
          </button>
        ) : (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => save(false)}>
            บันทึก
          </button>
        )}
      </footer>
    </dialog>
  );
}
