"use client";

import { Download, Laptop, Monitor, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { DiskBar } from "@/components/DiskBar";
import { DeviceDialog, holderLabel } from "@/components/DeviceDialog";
import { api, errorMessage } from "@/lib/api";
import {
  DEVICE_STATUS,
  DEVICE_TYPES,
  guessHolder,
  isOlderVersion,
  isOnline,
  ONLINE_MINUTES,
  seenAgo,
  typeOf,
  type Device,
  type DeviceHolder,
} from "@/lib/devices";

type Tab = "register" | "pending" | "blocked";

function Tile({ label, value, tone, note }: { label: string; value: number; tone: string; note?: string }) {
  return (
    <div className={`rounded-2xl border-t-4 bg-white p-4 shadow-sm ${tone}`}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {note && <div className="text-[11px] text-faint">{note}</div>}
    </div>
  );
}

export default function HardwarePage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [holders, setHolders] = useState<DeviceHolder[]>([]);
  const [installerReady, setInstallerReady] = useState(true);
  const [agentVersion, setAgentVersion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("register");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Device | "new" | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Reload every minute so Online / Offline stays current.
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .devices()
        .then((r) => {
          if (!alive) return;
          setDevices(r.devices);
          setHolders(r.holders);
          setInstallerReady(r.installerReady);
          setAgentVersion(r.agentVersion);
          setNow(Date.now());
        })
        .catch((e) => alive && setError(errorMessage(e)));
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  if (error) return <div className="card p-8 text-center text-red-500">{error}</div>;
  if (!devices) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const pending = devices.filter((d) => d.agentStatus === "pending");
  const blocked = devices.filter((d) => d.agentStatus === "blocked");
  const register = devices.filter((d) => d.agentStatus === "approved" || d.agentStatus === "none");
  const withAgent = register.filter((d) => d.agentStatus === "approved");
  const online = withAgent.filter((d) => isOnline(d, now)).length;
  const outdated = withAgent.filter((d) => isOlderVersion(d.agentVersion, agentVersion));
  const holderOf = (d: Device) => holders.find((h) => h.id === d.holderId);

  const words = search.trim().toLowerCase();
  const rows = (tab === "pending" ? pending : tab === "blocked" ? blocked : register).filter((d) => {
    if (type !== "all" && typeOf(d) !== type) return false;
    if (!words) return true;
    const holder = holderOf(d);
    return [
      d.computerName,
      d.assetNumber,
      d.serialNumber,
      d.model,
      d.manufacturer,
      d.loginUser,
      d.ipAddress,
      d.holderName,
      holder?.name,
      holder?.nickname,
      holder?.code,
      holder?.team,
    ]
      .join(" ")
      .toLowerCase()
      .includes(words);
  });

  const tabs: [Tab, string, number][] = [
    ["register", "ทะเบียนเครื่อง", register.length],
    ["pending", "รออนุมัติ", pending.length],
    ...(blocked.length ? ([["blocked", "บล็อก", blocked.length]] as [Tab, string, number][]) : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Hardware / คอมพิวเตอร์</h1>
          <p className="mt-1 text-sm text-muted">
            IT Assets · ข้อมูลจาก agent ที่ติดตั้งด้วย install.cmd · Online = ส่งข้อมูลภายใน {ONLINE_MINUTES}{" "}
            นาที · เห็นเฉพาะ Admin / IT
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/devices/installer?file=install"
            className={`btn-secondary inline-flex items-center gap-1.5 py-1.5 text-sm ${
              installerReady ? "" : "pointer-events-none opacity-50"
            }`}
            aria-disabled={!installerReady}
          >
            <Download className="h-4 w-4" /> install_agent {agentVersion}.cmd
          </a>
          <a
            href="/api/devices/installer?file=uninstall"
            className="btn-secondary inline-flex items-center gap-1.5 py-1.5 text-sm"
          >
            <Download className="h-4 w-4" /> uninstall_agent.cmd
          </a>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1.5 py-1.5 text-sm"
            onClick={() => setOpen("new")}
          >
            <Plus className="h-4 w-4" /> เพิ่มเครื่องเอง
          </button>
        </div>
      </div>

      {outdated.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          มี {outdated.length} เครื่องที่ยังใช้ agent รุ่นเก่า (
          {outdated.map((d) => d.computerName).join(", ")}): ดาวน์โหลด install_agent {agentVersion}.cmd
          แล้วรันซ้ำที่เครื่องนั้น (Run as administrator) ข้อมูลและผู้ถือครองเดิมยังอยู่ครบ
        </div>
      )}

      {!installerReady && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          ยังดาวน์โหลด install.cmd ไม่ได้: ต้องตั้งค่า <code className="font-mono">DEVICE_ENROLL_KEY</code> ใน
          Vercel (Settings → Environment Variables) เป็นข้อความสุ่ม A-Z a-z 0-9 ยาว 32 ตัวขึ้นไป แล้ว Redeploy
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="เครื่องในทะเบียน" value={register.length} tone="border-t-emerald-500" />
        <Tile
          label="🟢 Online"
          value={online}
          tone="border-t-lime-500"
          note={`จาก ${withAgent.length} เครื่องที่มี agent`}
        />
        <Tile label="⚪ Offline" value={withAgent.length - online} tone="border-t-slate-400" />
        <Tile
          label="รออนุมัติ"
          value={pending.length}
          tone={pending.length ? "border-t-amber-500" : "border-t-slate-200"}
          note={pending.length ? "เครื่องที่ลงทะเบียนเข้ามาใหม่" : undefined}
        />
      </div>

      <section className="rounded-3xl bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          <div className="flex rounded-xl bg-white p-1 shadow-sm">
            {tabs.map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === key ? "bg-emerald-600 text-white" : "text-muted hover:bg-emerald-50"
                }`}
              >
                {label}
                <span
                  className={`ml-1.5 rounded-full px-1.5 text-xs ${
                    tab === key
                      ? "bg-white/25"
                      : key === "pending" && count
                        ? "bg-amber-500 text-white"
                        : "bg-slate-100"
                  }`}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>
          <select
            className="field !w-auto bg-white"
            aria-label="ประเภท"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">ทุกประเภท</option>
            {Object.entries(DEVICE_TYPES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <input
            className="field !w-72 bg-white"
            placeholder="ค้นหาชื่อเครื่อง / ผู้ถือครอง / Serial / IP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="text-xs text-muted">{rows.length} เครื่อง</span>
        </div>

        <div className="w-fit max-w-full overflow-x-auto rounded-2xl bg-white shadow-sm">
          {/* As wide as its content (not the page), with tighter cells. */}
          <table className="sheet !w-auto text-[12.5px] [&_td]:!px-2.5 [&_td]:whitespace-nowrap [&_th]:!px-2.5 [&_th]:whitespace-nowrap">
            <thead>
              <tr className="[&>th]:bg-gradient-to-r [&>th]:from-emerald-600 [&>th]:to-teal-500">
                <th>สถานะ</th>
                <th>เครื่อง</th>
                <th>ผู้ถือครอง</th>
                <th>Studio / ทีม</th>
                <th>ยี่ห้อ / รุ่น</th>
                <th>CPU</th>
                <th className="text-right">RAM</th>
                <th>ฮาร์ดดิสก์ / พื้นที่ว่าง</th>
                <th>OS</th>
                <th>IP</th>
                <th>Agent</th>
                {tab === "pending" && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={tab === "pending" ? 12 : 11} className="py-10 text-center text-muted">
                    {tab === "pending"
                      ? "ไม่มีเครื่องรออนุมัติ · ดาวน์โหลด install.cmd แล้วรันที่เครื่อง client (Run as administrator)"
                      : devices.length === 0
                        ? "ยังไม่มีเครื่อง · ดาวน์โหลด install.cmd แล้วรันที่เครื่อง client เครื่องจะขึ้นในแท็บ “รออนุมัติ”"
                        : "ไม่พบรายการ"}
                  </td>
                </tr>
              )}
              {rows.map((d) => {
                const holder = holderOf(d);
                const login = d.loginUser || d.lastLoginUser;
                const suggestion = !holder && login ? guessHolder(login, holders) : null;
                const live = d.agentStatus !== "none" && isOnline(d, now);
                const Icon = typeOf(d) === "workstation" ? Monitor : Laptop;
                return (
                  <tr
                    key={d.id}
                    className="cursor-pointer transition-colors hover:bg-emerald-100"
                    onClick={() => setOpen(d)}
                  >
                    <td className="whitespace-nowrap">
                      {d.agentStatus === "none" ? (
                        <span className="text-xs text-faint">ไม่มี agent</span>
                      ) : (
                        <>
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${live ? "text-emerald-700" : "text-slate-500"}`}
                          >
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${live ? "bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-200" : "bg-slate-300"}`}
                            />
                            {live ? "Online" : "Offline"}
                          </span>
                          <div className="text-[11px] text-faint">{seenAgo(d.lastSeenAt, now)}</div>
                        </>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800">{d.computerName || "–"}</div>
                          <div className="text-[11px] text-muted">
                            {d.assetNumber || <span className="text-faint">ยังไม่มีเลขครุภัณฑ์</span>}
                            {d.status !== "active" && (
                              <span className={`chip ml-1.5 !py-0 ${DEVICE_STATUS[d.status].tone}`}>
                                {DEVICE_STATUS[d.status].label}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {holder ? (
                        <div className="font-medium">{holderLabel(holder)}</div>
                      ) : d.holderName ? (
                        <div className="font-medium">{d.holderName}</div>
                      ) : (
                        <span className="chip bg-amber-100 text-amber-800">ยังไม่ Assign</span>
                      )}
                      {login && (
                        <div className="text-[11px] text-muted">
                          <span className="font-mono">{login}</span>
                          {suggestion && (
                            <span className="text-emerald-700">
                              {" "}
                              → {suggestion.nickname || suggestion.name}?
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>{holder?.team || <span className="text-faint">–</span>}</td>
                    <td>
                      <div>{d.manufacturer || "–"}</div>
                      <div className="text-[11px] text-muted">{d.model}</div>
                    </td>
                    <td className="max-w-[220px] truncate" title={d.cpu}>
                      {d.cpu
                        .replace(/\(R\)|\(TM\)|CPU|@.*$/g, "")
                        .replace(/\s+/g, " ")
                        .trim() || "–"}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {d.ramGb !== null ? `${d.ramGb} GB` : d.ramText || "–"}
                    </td>
                    <td>
                      <DiskBar device={d} />
                    </td>
                    <td className="whitespace-nowrap">
                      {d.osName.replace(/^Microsoft\s+/, "") || "–"}
                      {d.osActivated === false && (
                        <span className="chip ml-1 bg-red-100 !py-0 text-red-700">ไม่ Activate</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap tabular-nums text-muted">{d.ipAddress || "–"}</td>
                    <td className="whitespace-nowrap text-[11px]">
                      {!d.agentVersion ? (
                        <span className="text-faint">–</span>
                      ) : isOlderVersion(d.agentVersion, agentVersion) ? (
                        <span
                          className="font-semibold text-amber-700"
                          title={`รุ่นล่าสุดคือ ${agentVersion}: ดาวน์โหลด install_agent แล้วรันซ้ำ`}
                        >
                          {d.agentVersion}
                          <br />
                          <span className="font-normal">ต้องอัปเดต</span>
                        </span>
                      ) : (
                        <span className="text-muted" title="agent รุ่นล่าสุด">
                          {d.agentVersion}
                        </span>
                      )}
                    </td>
                    {tab === "pending" && (
                      <td className="whitespace-nowrap text-right">
                        <span className="btn-primary !px-2.5 !py-1 text-xs">อนุมัติ / Assign</span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {open && (
        <DeviceDialog
          device={open === "new" ? null : open}
          holders={holders}
          onSaved={setDevices}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
