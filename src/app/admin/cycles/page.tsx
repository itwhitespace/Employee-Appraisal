"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import IconButton from "@/components/IconButton";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Cycle } from "@/lib/types";

type CycleWithCount = Cycle & { evaluations: number };

interface CycleRowProps {
  cycle: CycleWithCount;
  onSave: (cycle: CycleWithCount, period: string) => Promise<void>;
  onOpen: (cycle: CycleWithCount) => Promise<void>;
  onDelete: (cycle: CycleWithCount) => Promise<void>;
}

function CycleRow({ cycle, onSave, onOpen, onDelete }: CycleRowProps) {
  const [period, setPeriod] = useState(cycle.period);
  const [busy, setBusy] = useState(false);
  const dirty = period.trim() !== cycle.period;
  const deletable = !cycle.current && cycle.evaluations === 0;

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    await task();
    setBusy(false);
  };

  return (
    <tr>
      <td className="pt-4 font-semibold">{cycle.id}</td>
      <td>
        <input
          className="field"
          aria-label={`ช่วงเวลาของรอบ ${cycle.id}`}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        />
      </td>
      <td className="pt-4 text-center tabular-nums text-muted">{cycle.evaluations || "–"}</td>
      <td className="pt-3.5">
        {cycle.current ? (
          <span className="chip bg-emerald-50 text-emerald-700">รอบปัจจุบัน</span>
        ) : (
          <button type="button" className="btn-text" disabled={busy} onClick={() => run(() => onOpen(cycle))}>
            ตั้งเป็นรอบปัจจุบัน
          </button>
        )}
      </td>
      <td className="whitespace-nowrap !px-1.5 !py-1.5 text-right">
        <IconButton
          icon="save"
          label="บันทึก"
          disabled={!dirty || busy}
          onClick={() => run(() => onSave(cycle, period.trim()))}
        />
        <IconButton
          icon="delete"
          label={
            cycle.current
              ? "ลบรอบปัจจุบันไม่ได้"
              : cycle.evaluations > 0
                ? "รอบที่มีแบบประเมินแล้วลบไม่ได้"
                : "ลบ"
          }
          tone="danger"
          disabled={busy || !deletable}
          onClick={() => run(() => onDelete(cycle))}
        />
      </td>
    </tr>
  );
}

export default function CyclesPage() {
  const confirm = useConfirm();
  const { refresh } = useAuth();
  const [cycles, setCycles] = useState<CycleWithCount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newId, setNewId] = useState("");
  const [newPeriod, setNewPeriod] = useState("");
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    try {
      setCycles((await api.cycles()).cycles);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loadError) return <div className="card p-8 text-center text-red-500">{loadError}</div>;
  if (!cycles) return <div className="card p-8 text-center text-muted">กำลังโหลด…</div>;

  const current = cycles.find((c) => c.current);

  const attempt = async (task: () => Promise<unknown>) => {
    try {
      await task();
      await reload();
      setNotice(null);
      return true;
    } catch (e) {
      setNotice(errorMessage(e));
      return false;
    }
  };

  const save = async (cycle: CycleWithCount, period: string) => {
    const agreed = await confirm({
      title: "บันทึกช่วงเวลาของรอบนี้?",
      message: `${cycle.id} · ${period || "ไม่ระบุช่วงเวลา"}`,
      confirmLabel: "บันทึก",
    });
    if (agreed && (await attempt(() => api.updateCycle(cycle.id, period)))) await refresh();
  };

  const open = async (cycle: CycleWithCount) => {
    const agreed = await confirm({
      title: `เริ่มรอบประเมิน ${cycle.id}?`,
      message: current
        ? `รอบ ${current.id} จะถูกปิดและดูได้อย่างเดียว ทุกคนจะเริ่มกรอกแบบประเมินของรอบ ${cycle.id}`
        : `ทุกคนจะเริ่มกรอกแบบประเมินของรอบ ${cycle.id}`,
      confirmLabel: "เริ่มรอบนี้",
    });
    // The sidebar shows the open cycle, so the session is re-read after the switch.
    if (agreed && (await attempt(() => api.openCycle(cycle.id)))) await refresh();
  };

  const remove = async (cycle: CycleWithCount) => {
    const agreed = await confirm({
      title: "ลบรอบประเมินนี้?",
      message: cycle.id,
      confirmLabel: "ลบ",
      tone: "danger",
    });
    if (agreed) await attempt(() => api.deleteCycle(cycle.id));
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newId.trim()) return setNotice("กรุณากรอกชื่อรอบประเมิน");
    setAdding(true);
    const added = await attempt(() => api.createCycle(newId.trim(), newPeriod.trim()));
    setAdding(false);
    if (added) {
      setNewId("");
      setNewPeriod("");
    }
  };

  return (
    <div className="max-w-[1000px] space-y-6">
      <div>
        <h1 className="page-title">รอบประเมิน</h1>
        <p className="mt-1 text-sm text-muted">
          เพิ่มรอบใหม่แล้วตั้งเป็นรอบปัจจุบันเมื่อพร้อมเริ่ม · รอบที่ปิดแล้วเก็บไว้ดูย้อนหลังได้
        </p>
      </div>

      {notice && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {notice}
        </p>
      )}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="sheet min-w-[720px]">
            <thead>
              <tr>
                <th className="w-40">รอบประเมิน</th>
                <th>ช่วงเวลา</th>
                <th className="w-28 text-center">แบบประเมิน</th>
                <th className="w-40">สถานะ</th>
                <th className="w-24" aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {cycles.map((cycle) => (
                <CycleRow
                  // Remount after a save so the input picks up the stored value.
                  key={`${cycle.id}-${cycle.period}`}
                  cycle={cycle}
                  onSave={save}
                  onOpen={open}
                  onDelete={remove}
                />
              ))}
            </tbody>
          </table>
        </div>

        <form
          onSubmit={add}
          className="flex flex-wrap items-end gap-3 border-t border-line bg-canvas/70 px-5 py-4"
        >
          <label className="block w-48">
            <span className="mb-1.5 block text-xs font-medium text-muted">ชื่อรอบประเมิน</span>
            <input
              className="field bg-white"
              placeholder="เช่น FY2027/28"
              maxLength={40}
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
            />
          </label>
          <label className="block min-w-[240px] flex-1">
            <span className="mb-1.5 block text-xs font-medium text-muted">ช่วงเวลา</span>
            <input
              className="field bg-white"
              placeholder="เช่น ต.ค. 2027 – ก.ย. 2028"
              maxLength={80}
              value={newPeriod}
              onChange={(e) => setNewPeriod(e.target.value)}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={adding}>
            {adding ? "กำลังเพิ่ม…" : "+ เพิ่มรอบประเมิน"}
          </button>
        </form>
      </section>

      <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
        <li>ชื่อรอบประเมินแก้ไขไม่ได้หลังสร้าง แก้ได้เฉพาะช่วงเวลา</li>
        <li>
          เมื่อเริ่มรอบใหม่ แบบประเมินของรอบเดิมจะถูกเก็บไว้ตามสภาพ ณ ตอนนั้น
          การแก้ข้อประเมินหรือ Level ภายหลังจะไม่กระทบผลย้อนหลัง
        </li>
        <li>ดูผลย้อนหลังได้จากตัวเลือกรอบประเมินที่ Dashboard หน้าทีมของฉัน และในแบบประเมิน</li>
      </ul>
    </div>
  );
}
