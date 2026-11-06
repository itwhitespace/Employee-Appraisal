"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Device, DeviceHolder, HoldingMatch } from "@/lib/devices";
import { formatDate } from "@/lib/format";

/**
 * "Which computer did this person use, and who has it now?": searches the holder history by name,
 * nickname or employee code, including people who have left.
 */
export function DeviceHistorySearch({
  devices,
  holders,
  onOpen,
}: {
  devices: Device[];
  holders: DeviceHolder[];
  onOpen: (deviceId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<HoldingMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setMatches(null);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      api
        .searchDeviceHistory(q)
        .then((r) => alive && (setMatches(r.matches), setError(null)))
        .catch((e) => alive && setError(errorMessage(e)));
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const nowWith = (m: HoldingMatch) => {
    const device = devices.find((d) => d.id === m.deviceId);
    const id = device?.holderId ?? m.currentHolderId;
    const h = holders.find((x) => x.id === id);
    if (h) return `${h.name}${h.nickname ? ` (${h.nickname})` : ""}${h.team ? ` · ${h.team}` : ""}`;
    return device?.holderName || m.currentHolderName || "";
  };

  return (
    <div className="space-y-3">
      <div className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-faint" />
        <input
          className="field bg-white !pl-8"
          placeholder="พิมพ์ชื่อ ชื่อเล่น หรือรหัสพนักงาน (รวมคนที่ลาออกแล้ว)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {matches === null ? (
        <p className="px-1 text-xs text-muted">
          ใช้ค้นว่าคนนี้เคยใช้เครื่องไหน ช่วงไหน และตอนนี้เครื่องนั้นอยู่กับใคร
        </p>
      ) : matches.length === 0 ? (
        <p className="px-1 text-sm text-muted">ไม่พบประวัติของ “{query.trim()}”</p>
      ) : (
        <div className="w-fit max-w-full overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="sheet !w-auto text-[12.5px] [&_td]:!px-2.5 [&_td]:whitespace-nowrap [&_th]:!px-2.5 [&_th]:whitespace-nowrap">
            <thead>
              <tr className="[&>th]:!border-[#3b2f8f] [&>th]:bg-[#3b2f8f]">
                <th>ผู้ถือครอง (ตามประวัติ)</th>
                <th>แผนก</th>
                <th>Studio / ทีม</th>
                <th>ตั้งแต่</th>
                <th>ถึง</th>
                <th>เครื่อง</th>
                <th>ตอนนี้อยู่กับ</th>
                <th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => {
                const current = !m.endDate;
                return (
                  <tr
                    key={m.id}
                    className="cursor-pointer transition-colors hover:bg-violet-100/70"
                    onClick={() => onOpen(m.deviceId)}
                  >
                    <td>
                      {m.holderCode && <span className="text-muted">{m.holderCode} · </span>}
                      <span className="font-medium">{m.holderName}</span>
                    </td>
                    <td>{m.department || "–"}</td>
                    <td>{m.team || "–"}</td>
                    <td className="tabular-nums">{formatDate(m.startDate)}</td>
                    <td className="tabular-nums">
                      {current ? (
                        <span className="chip bg-violet-100 text-violet-800">ปัจจุบัน</span>
                      ) : (
                        formatDate(m.endDate)
                      )}
                    </td>
                    <td>
                      <div className="font-semibold text-slate-800">{m.computerName || "–"}</div>
                      <div className="text-[11px] text-muted">{m.assetNumber || ""}</div>
                    </td>
                    <td>
                      {current ? (
                        <span className="text-muted">คนเดียวกัน</span>
                      ) : (
                        nowWith(m) || <span className="text-faint">ไม่ระบุ / ส่วนกลาง</span>
                      )}
                    </td>
                    <td className="text-muted">{m.note || "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
