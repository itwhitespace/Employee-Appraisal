"use client";

import { Download, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { DeviceDialog, holderLabel } from "@/components/DeviceDialog";
import { api, errorMessage } from "@/lib/api";
import {
  channelLabel,
  LICENSE_CHANNELS,
  licenseStatusText,
  maskedKey,
  seenAgo,
  type Device,
  type DeviceHolder,
} from "@/lib/devices";
import { formatDateTime } from "@/lib/format";

type Level = "bad" | "check" | "nodata" | "ok";
type Filter = "all" | "issues" | "nodata";

interface Finding {
  level: Level;
  text: string;
}

const LEVEL_TONE: Record<Level, string> = {
  bad: "bg-red-100 text-red-700",
  check: "bg-amber-100 text-amber-800",
  nodata: "bg-slate-100 text-slate-600",
  ok: "bg-emerald-100 text-emerald-700",
};

// The generic key Windows Pro is installed with when it is activated by a digital licence
// (VK7JG-…-3V66T): the same on every such computer, so it is not a copied key.
const GENERIC_KEYS = new Set(["3V66T"]);

const isWindows = (d: Device) => /windows/i.test(d.osName) || (d.agentStatus !== "none" && !d.osName);

/** What the audit says about one computer, worst first. */
function findingsOf(d: Device, sameKey: Map<string, number>): Finding[] {
  if (d.agentStatus === "none") return [{ level: "nodata", text: "ไม่มี agent: ตรวจเองที่เครื่อง" }];
  if (!d.osPartialKey && !d.osLicenseChannel)
    return [{ level: "nodata", text: "ยังไม่มีข้อมูล: รัน install.cmd ใหม่ที่เครื่อง" }];
  const list: Finding[] = [];
  if (d.osActivated === false) list.push({ level: "bad", text: "ยังไม่ Activate" });
  const shared = sameKey.get(d.osPartialKey) ?? 0;
  if (shared > 1 && !GENERIC_KEYS.has(d.osPartialKey) && !d.osLicenseChannel.startsWith("Volume"))
    list.push({ level: "check", text: `Key ซ้ำกับอีก ${shared - 1} เครื่อง` });
  if (d.osLicenseChannel === "Volume:KMS")
    list.push({ level: "check", text: "KMS: ตรวจว่าบริษัทมี KMS จริง" });
  if (d.osBiosKey && d.osBiosKeyMatch === false)
    list.push({ level: "check", text: "ไม่ได้ใช้ key ที่มากับเครื่อง (BIOS)" });
  if (/home/i.test(d.osName)) list.push({ level: "check", text: "Windows Home: ไม่เหมาะกับใช้งานในบริษัท" });
  return list.length ? list : [{ level: "ok", text: "ปกติ" }];
}

const worst = (list: Finding[]) =>
  list.some((f) => f.level === "bad")
    ? "bad"
    : list.some((f) => f.level === "check")
      ? "check"
      : list[0].level;

async function exportAudit(rows: { d: Device; holder: string; findings: Finding[] }[]) {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("OS License", { views: [{ state: "frozen", ySplit: 1 }] });
  const heads: [string, number][] = [
    ["ชื่อเครื่อง", 20],
    ["เลขครุภัณฑ์", 16],
    ["ผู้ถือครอง", 30],
    ["OS", 30],
    ["เวอร์ชัน", 22],
    ["Activated", 11],
    ["License", 14],
    ["Product Key (5 ตัวท้าย)", 32],
    ["Key ใน BIOS", 20],
    ["ผลตรวจ", 44],
    ["ส่งข้อมูลล่าสุด", 18],
  ];
  heads.forEach(([title, width], i) => {
    sheet.getColumn(i + 1).width = width;
    const cell = sheet.getCell(1, i + 1);
    cell.value = title;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7C3AED" } };
  });
  for (const { d, holder, findings } of rows) {
    sheet
      .addRow([
        d.computerName,
        d.assetNumber || null,
        holder || null,
        d.osName || null,
        d.osVersion || null,
        d.osActivated === null ? null : d.osActivated ? "Yes" : "No",
        d.osLicenseChannel ? channelLabel(d.osLicenseChannel) : null,
        maskedKey(d.osPartialKey) || null,
        d.osBiosKey === null ? null : !d.osBiosKey ? "ไม่มี" : d.osBiosKeyMatch ? "มี · ตรง" : "มี · ไม่ตรง",
        findings.map((f) => f.text).join(", "),
        d.lastSeenAt ? new Date(d.lastSeenAt) : null,
      ])
      .getCell(11).numFmt = "dd/mm/yyyy hh:mm";
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: heads.length } };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()]));
  link.download = `os-license-audit-${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Tile({ label, value, tone, note }: { label: string; value: number; tone: string; note?: string }) {
  return (
    <div className={`rounded-2xl border-t-4 bg-white p-4 shadow-sm ${tone}`}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {note && <div className="text-[11px] text-faint">{note}</div>}
    </div>
  );
}

/**
 * Windows licences of the computers in the register, for checking and audit. Only the last 5
 * characters of each key are known (Windows shows no more); the full key is never collected.
 */
export default function OsLicensePage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [holders, setHolders] = useState<DeviceHolder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Device | null>(null);

  useEffect(() => {
    api
      .devices()
      .then((r) => {
        setDevices(r.devices);
        setHolders(r.holders);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <div className="card p-8 text-center text-red-500">{error}</div>;
  if (!devices) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const windows = devices.filter(
    (d) =>
      (d.agentStatus === "approved" || d.agentStatus === "none") && d.status !== "retired" && isWindows(d),
  );
  const sameKey = new Map<string, number>();
  for (const d of windows)
    if (d.osPartialKey) sameKey.set(d.osPartialKey, (sameKey.get(d.osPartialKey) ?? 0) + 1);

  const holderName = (d: Device) => {
    const h = holders.find((x) => x.id === d.holderId);
    return h ? holderLabel(h) : d.holderName;
  };
  const all = windows
    .map((d) => {
      const findings = findingsOf(d, sameKey);
      return { d, holder: holderName(d), findings, level: worst(findings) };
    })
    .sort(
      (a, b) =>
        ["bad", "check", "nodata", "ok"].indexOf(a.level) -
          ["bad", "check", "nodata", "ok"].indexOf(b.level) ||
        a.d.computerName.localeCompare(b.d.computerName),
    );

  const issues = all.filter((r) => r.level === "bad" || r.level === "check");
  const noData = all.filter((r) => r.level === "nodata");
  const activated = windows.filter((d) => d.osActivated === true).length;
  const channels = new Map<string, number>();
  for (const d of windows)
    if (d.osLicenseChannel) channels.set(d.osLicenseChannel, (channels.get(d.osLicenseChannel) ?? 0) + 1);

  const words = search.trim().toLowerCase();
  const rows = (filter === "issues" ? issues : filter === "nodata" ? noData : all).filter(
    (r) =>
      !words ||
      [r.d.computerName, r.d.assetNumber, r.holder, r.d.osName, r.d.osPartialKey, r.d.osLicenseChannel]
        .join(" ")
        .toLowerCase()
        .includes(words),
  );

  const filters: [Filter, string, number][] = [
    ["all", "ทั้งหมด", all.length],
    ["issues", "ต้องตรวจสอบ", issues.length],
    ["nodata", "ยังไม่มีข้อมูล", noData.length],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">OS License / Audit</h1>
          <p className="mt-1 text-sm text-muted">
            IT Assets · License Windows ของเครื่องในทะเบียน (จาก agent) · เก็บเฉพาะ 5 ตัวท้ายของ Product Key
            ไม่เก็บ key เต็ม
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-1.5 py-1.5 text-sm"
          onClick={() => void exportAudit(all)}
          disabled={!all.length}
        >
          <Download className="h-4 w-4" /> Excel สำหรับ Audit
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="เครื่อง Windows" value={windows.length} tone="border-t-violet-500" />
        <Tile
          label="✓ Activated"
          value={activated}
          tone="border-t-emerald-500"
          note={windows.length ? `${Math.round((100 * activated) / windows.length)}% ของทั้งหมด` : undefined}
        />
        <Tile
          label="ต้องตรวจสอบ"
          value={issues.length}
          tone={issues.length ? "border-t-red-500" : "border-t-slate-200"}
          note={issues.length ? "ไม่ Activate / Key ซ้ำ / Home ฯลฯ" : undefined}
        />
        <Tile
          label="ยังไม่มีข้อมูล"
          value={noData.length}
          tone={noData.length ? "border-t-slate-400" : "border-t-slate-200"}
          note={noData.length ? "agent รุ่นเก่า หรือไม่มี agent" : undefined}
        />
      </div>

      {channels.size > 0 && (
        <div className="flex flex-wrap gap-2">
          {[...channels.entries()].map(([channel, count]) => (
            <span
              key={channel}
              className="chip bg-violet-50 text-violet-800"
              title={LICENSE_CHANNELS[channel]?.note}
            >
              {channelLabel(channel)} · {count} เครื่อง
            </span>
          ))}
        </div>
      )}

      <section className="rounded-3xl bg-gradient-to-br from-violet-50 via-indigo-50 to-sky-50 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          <div className="flex rounded-xl bg-white p-1 shadow-sm">
            {filters.map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  filter === key ? "bg-violet-600 text-white" : "text-muted hover:bg-violet-50"
                }`}
              >
                {label}
                <span
                  className={`ml-1.5 rounded-full px-1.5 text-xs ${
                    filter === key
                      ? "bg-white/25"
                      : key === "issues" && count
                        ? "bg-red-500 text-white"
                        : "bg-slate-100"
                  }`}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>
          <input
            className="field !w-72 bg-white"
            placeholder="ค้นหาชื่อเครื่อง / ผู้ถือครอง / Key 5 ตัวท้าย…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="text-xs text-muted">{rows.length} เครื่อง</span>
        </div>

        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="sheet min-w-[1100px] text-[12.5px]">
            <thead>
              <tr className="[&>th]:bg-gradient-to-r [&>th]:from-violet-600 [&>th]:to-indigo-500">
                <th>เครื่อง</th>
                <th>ผู้ถือครอง</th>
                <th>OS</th>
                <th>Activated</th>
                <th>License</th>
                <th>Product Key</th>
                <th>Key ใน BIOS</th>
                <th>ผลตรวจ</th>
                <th>ส่งข้อมูลล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-muted">
                    {windows.length === 0 ? "ยังไม่มีเครื่อง Windows ในทะเบียน" : "ไม่พบรายการ"}
                  </td>
                </tr>
              )}
              {rows.map(({ d, holder, findings }) => (
                <tr key={d.id} className="cursor-pointer hover:bg-violet-50/60" onClick={() => setOpen(d)}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700">
                        <KeyRound className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800">{d.computerName || "–"}</div>
                        <div className="text-[11px] text-muted">{d.assetNumber || "–"}</div>
                      </div>
                    </div>
                  </td>
                  <td>{holder || <span className="text-faint">–</span>}</td>
                  <td>
                    <div>{d.osName.replace(/^Microsoft\s+/i, "") || "–"}</div>
                    <div className="text-[11px] text-muted">{d.osVersion}</div>
                  </td>
                  <td className="whitespace-nowrap">
                    {d.osActivated === null ? (
                      <span className="text-faint">–</span>
                    ) : d.osActivated ? (
                      <span className="font-medium text-emerald-700">✓ Activated</span>
                    ) : (
                      <span className="font-medium text-red-600">
                        ✕ {licenseStatusText(d.osLicenseStatus) || "ยังไม่ Activate"}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap" title={LICENSE_CHANNELS[d.osLicenseChannel]?.note}>
                    {d.osLicenseChannel ? (
                      channelLabel(d.osLicenseChannel)
                    ) : (
                      <span className="text-faint">–</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap font-mono text-[12px]">
                    {d.osPartialKey ? (
                      <>
                        <span className="text-faint">XXXXX-XXXXX-XXXXX-XXXXX-</span>
                        <span className="font-semibold text-ink">{d.osPartialKey}</span>
                      </>
                    ) : (
                      <span className="text-faint">–</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    {d.osBiosKey === null ? (
                      <span className="text-faint">–</span>
                    ) : !d.osBiosKey ? (
                      <span className="text-muted">ไม่มี</span>
                    ) : d.osBiosKeyMatch ? (
                      <span className="text-emerald-700">มี · ตรง</span>
                    ) : (
                      <span className="text-amber-700">มี · ไม่ตรง</span>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {findings.map((f) => (
                        <span key={f.text} className={`chip !py-0 ${LEVEL_TONE[f.level]}`}>
                          {f.text}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-[11px] text-muted">
                    {d.lastSeenAt ? (
                      <>
                        <div>{formatDateTime(d.lastSeenAt)}</div>
                        <div className="text-faint">{seenAgo(d.lastSeenAt)}</div>
                      </>
                    ) : (
                      "–"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded-2xl bg-white p-4 text-xs leading-relaxed text-muted shadow-sm">
        <p className="mb-1 font-semibold text-ink">อ่านผลตรวจ</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>
            <b>OEM</b> = มากับเครื่อง ใช้ได้กับเครื่องนั้นเท่านั้น · <b>Retail</b> = ซื้อแยก ควรมีใบเสร็จ /
            กล่อง · <b>Volume</b> = License องค์กร
          </li>
          <li>
            <b>Key ซ้ำ</b>: Retail / OEM key เดียวกันไม่ควรอยู่หลายเครื่อง · ยกเว้น <b>3V66T</b> ซึ่งเป็น key
            ทั่วไปที่ Windows Pro ใช้เมื่อ Activate ด้วย Digital License (ผูกกับฮาร์ดแวร์ / บัญชี Microsoft)
            ทุกเครื่องจะเป็น 5 ตัวนี้เหมือนกัน ให้ดูที่สถานะ Activated แทน
          </li>
          <li>
            <b>Key ใน BIOS ไม่ตรง</b>: เครื่องมี key มาจากโรงงาน แต่ใช้อีก key อยู่ ตรวจว่า key
            ที่ใช้มีที่มาถูกต้อง
          </li>
          <li>ระบบไม่เก็บ Product Key เต็ม ให้เก็บ key จริงไว้ใน Password Manager</li>
        </ul>
      </div>

      {open && (
        <DeviceDialog
          device={open}
          holders={holders}
          onSaved={(list) => setDevices(list)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
