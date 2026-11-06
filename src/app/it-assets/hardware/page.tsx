"use client";

import { Download, FileSpreadsheet, Laptop, Monitor, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { DiskBar } from "@/components/DiskBar";
import { DeviceDialog, holderLabel } from "@/components/DeviceDialog";
import { DeviceHistorySearch } from "@/components/DeviceHistorySearch";
import { api, errorMessage } from "@/lib/api";
import { exportDevices } from "@/lib/device-export";
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

type Tab = "register" | "pending" | "blocked" | "history";

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
  const [macAgentVersion, setMacAgentVersion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("register");
  const [type, setType] = useState("all");
  const [team, setTeam] = useState<string | null>(null);
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
          setAgentVersion(r.agentVersion ?? "");
          setMacAgentVersion(r.macAgentVersion ?? "");
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
  // The newest agent for the computer's system: Windows and Mac agents have their own versions.
  const latestFor = (d: Device) => (/macos/i.test(d.osName) ? macAgentVersion : agentVersion);
  const outdated = withAgent.filter((d) => isOlderVersion(d.agentVersion, latestFor(d)));
  const holderOf = (d: Device) => holders.find((h) => h.id === d.holderId);

  const teamOf = (d: Device) => holderOf(d)?.team || (d.holderId ? "" : d.holderTeam);
  // Who already has a computer in use: they are not offered again for another one.
  const taken = new Map(
    devices
      .filter((d) => d.holderId && d.status !== "retired" && d.agentStatus !== "blocked")
      .map((d) => [d.holderId!, d.id]),
  );
  const inTab = tab === "pending" ? pending : tab === "blocked" ? blocked : register;
  // Studio / team buttons: the teams of the computers in this tab, most computers first.
  const teamCounts = new Map<string, number>();
  for (const d of inTab) teamCounts.set(teamOf(d), (teamCounts.get(teamOf(d)) ?? 0) + 1);
  const teams = [...teamCounts.entries()].sort((a, b) =>
    !a[0] ? 1 : !b[0] ? -1 : a[0].localeCompare(b[0], "th", { numeric: true }),
  );

  const words = search.trim().toLowerCase();
  const rows = inTab.filter((d) => {
    if (type !== "all" && typeOf(d) !== type) return false;
    if (team !== null && teamOf(d) !== team) return false;
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
      d.holderTeam,
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
    ["history", "ค้นหาประวัติ", -1],
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
          <details className="relative">
            <summary className="btn-secondary inline-flex cursor-pointer list-none items-center gap-1.5 py-1.5 text-sm">
              <Download className="h-4 w-4" /> ดาวน์โหลด Agent ▾
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-[330px] rounded-xl border border-line bg-white p-2 shadow-float">
              {(
                [
                  [
                    "Windows",
                    "install",
                    `install_agent_${agentVersion.replace(/\./g, "_")}.cmd`,
                    "คลิกขวา > Run as administrator",
                    true,
                  ],
                  ["Windows", "uninstall", "uninstall_agent.cmd", "ถอนการติดตั้ง", false],
                  [
                    "macOS",
                    "install-mac",
                    `install_agent_mac_${macAgentVersion.replace(/\./g, "_")}.sh`,
                    "Terminal: พิมพ์ bash␣ แล้วลากไฟล์มาวาง กด Return",
                    true,
                  ],
                  ["macOS", "uninstall-mac", "uninstall_agent_mac.sh", "ถอนการติดตั้ง", false],
                ] as const
              ).map(([os, file, name, how, needsKey]) => (
                <a
                  key={file}
                  href={`/api/devices/installer?file=${file}`}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-violet-50 ${
                    needsKey && !installerReady ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  <span
                    className={`chip !py-0 text-[11px] ${os === "macOS" ? "bg-slate-800 text-white" : "bg-sky-100 text-sky-800"}`}
                  >
                    {os}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{name}</span>
                    <span className="block text-[11px] text-muted">{how}</span>
                  </span>
                </a>
              ))}
            </div>
          </details>
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-1.5 py-1.5 text-sm"
            onClick={() => void exportDevices(register, holders)}
            disabled={!register.length}
          >
            <FileSpreadsheet className="h-4 w-4" /> Export Excel
          </button>
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
          {outdated.map((d) => d.computerName).join(", ")}): ดาวน์โหลดไฟล์ติดตั้งรุ่นล่าสุดจากปุ่ม “ดาวน์โหลด
          Agent” แล้วรันซ้ำที่เครื่องนั้น ข้อมูลและผู้ถือครองเดิมยังอยู่ครบ
        </div>
      )}

      {!installerReady && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          ยังดาวน์โหลด install.cmd ไม่ได้: ต้องตั้งค่า <code className="font-mono">DEVICE_ENROLL_KEY</code> ใน
          Vercel (Settings → Environment Variables) เป็นข้อความสุ่ม A-Z a-z 0-9 ยาว 32 ตัวขึ้นไป แล้ว Redeploy
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="เครื่องในทะเบียน" value={register.length} tone="border-t-violet-500" />
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

      <section className="rounded-3xl bg-white/55 p-3 ring-1 ring-white/80 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          <div className="flex rounded-xl bg-white p-1 shadow-sm">
            {tabs.map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key);
                  setTeam(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === key ? "bg-[#2b2170] text-white" : "text-muted hover:bg-violet-50"
                }`}
              >
                {label}
                {count >= 0 && (
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
                )}
              </button>
            ))}
          </div>
          {tab !== "history" && (
            <>
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
            </>
          )}
          {tab !== "history" && (
            <span className="ml-auto pr-1 text-sm text-muted">
              <b className="text-2xl font-bold tabular-nums text-[#2b2170]">{rows.length}</b> เครื่อง
            </span>
          )}
        </div>

        {tab !== "history" && teams.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5 px-1">
            {[
              [null, "ทุก Studio / ทีม", inTab.length] as const,
              ...teams.map(([t, n]) => [t, t || "ไม่มีทีม / ส่วนกลาง", n] as const),
            ].map(([key, label, n]) => (
              <button
                key={key ?? "__all"}
                type="button"
                onClick={() => setTeam(key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  team === key
                    ? "border-[#2b2170] bg-[#2b2170] text-white"
                    : "border-violet-200 bg-white text-slate-700 hover:bg-violet-50"
                }`}
              >
                {label} <span className={team === key ? "text-white/80" : "text-faint"}>{n}</span>
              </button>
            ))}
          </div>
        )}

        {tab === "history" ? (
          <DeviceHistorySearch
            devices={devices}
            holders={holders}
            onOpen={(id) => setOpen(devices.find((d) => d.id === id) ?? null)}
          />
        ) : (
          <div className="w-fit max-w-full overflow-x-auto rounded-2xl bg-white shadow-sm">
            {/* As wide as its content (not the page), with tighter cells. */}
            <table className="sheet !w-auto text-[12.5px] [&_td]:!px-2.5 [&_td]:whitespace-nowrap [&_th]:!px-2.5 [&_th]:whitespace-nowrap">
              <thead>
                <tr className="[&>th]:!border-[#3b2f8f] [&>th]:bg-[#3b2f8f]">
                  <th>สถานะ</th>
                  <th>เครื่อง</th>
                  <th>ผู้ถือครอง</th>
                  <th>Studio / ทีม</th>
                  <th>ยี่ห้อ / รุ่น</th>
                  <th>CPU</th>
                  <th className="text-right">RAM</th>
                  <th>ฮาร์ดดิสก์ / พื้นที่ว่าง</th>
                  <th>OS</th>
                  <th>Agent</th>
                  {tab === "pending" && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={tab === "pending" ? 11 : 10} className="py-10 text-center text-muted">
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
                      className="cursor-pointer transition-colors hover:bg-violet-100/70"
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
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700">
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
                      <td>{teamOf(d) || <span className="text-faint">–</span>}</td>
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
                      <td className="whitespace-nowrap text-[11px]">
                        {!d.agentVersion ? (
                          <span className="text-faint">–</span>
                        ) : isOlderVersion(d.agentVersion, latestFor(d)) ? (
                          <span
                            className="font-semibold text-amber-700"
                            title={`รุ่นล่าสุดคือ ${latestFor(d)}: ดาวน์โหลดไฟล์ติดตั้งแล้วรันซ้ำ`}
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
        )}
      </section>

      {open && (
        <DeviceDialog
          device={open === "new" ? null : open}
          holders={holders}
          taken={taken}
          onSaved={setDevices}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
