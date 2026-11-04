"use client";

import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  CATEGORIES,
  CYCLE_NAMES,
  EMPTY_LICENSE,
  nextTerm,
  PAYMENT_NAMES,
  type BillingCycle,
  type LicenseInput,
  type LicenseRenewal,
  type PaymentMethod,
  type SoftwareLicense,
} from "@/lib/software";

const baht = (n: number | null) =>
  n === null ? "–" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const numberOrNull = (text: string) => (text.trim() === "" ? null : Number(text.replace(/,/g, "")));

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

/**
 * Adds or edits a license (`editing` null = add). In edit mode it shows the renewal history.
 * `onSaved` gets the whole list back from the server.
 */
export function LicenseDialog({
  editing,
  names,
  onSaved,
  onClose,
}: {
  editing: SoftwareLicense | null;
  /** Names already in use, offered while typing. */
  names: string[];
  onSaved: (licenses: SoftwareLicense[]) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<LicenseInput>(() => {
    if (!editing) return EMPTY_LICENSE;
    const { id: _id, updatedAt: _at, ...rest } = editing;
    return rest;
  });
  const [renewals, setRenewals] = useState<LicenseRenewal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    if (editing) {
      api
        .renewals(editing.id)
        .then((r) => setRenewals(r.renewals))
        .catch(() => setRenewals([]));
    }
  }, [editing]);

  const set = (patch: Partial<LicenseInput>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return setError("กรุณากรอกชื่อโปรแกรม / บริการ");
    setBusy(true);
    try {
      const result = editing ? await api.saveLicense(editing.id, form) : await api.addLicense(form);
      onSaved(result.licenses);
      dialog.current?.close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || !window.confirm(`ลบ ${editing.name} ${editing.detail} และประวัติการต่ออายุ?`)) return;
    setBusy(true);
    try {
      onSaved((await api.deleteLicense(editing.id)).licenses);
      dialog.current?.close();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const perpetual = form.billingCycle === "perpetual";
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="w-full max-w-3xl rounded-2xl p-0 shadow-float backdrop:bg-black/30 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={submit} noValidate>
        <header className="border-b border-line px-6 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">
            {editing ? "แก้ไข License" : "เพิ่ม License"}
          </h2>
          <p className="text-xs text-muted">
            ราคาเป็นบาทต่อปี · ไม่ต้องใส่รหัสผ่านหรือ License key ในหน้านี้
          </p>
        </header>
        <div className="grid max-h-[70vh] gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
          <Field label="ชื่อโปรแกรม / บริการ *">
            <input
              className="field"
              list="license-names"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
            <datalist id="license-names">
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          <Field label="รายละเอียด (ชื่อโดเมน / เลขสัญญา / Edition)">
            <input className="field" value={form.detail} onChange={(e) => set({ detail: e.target.value })} />
          </Field>
          <Field label="กลุ่ม">
            <select
              className="field"
              value={form.category}
              onChange={(e) => set({ category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="สถานะ">
            <select
              className="field"
              value={form.status}
              onChange={(e) => set({ status: e.target.value as LicenseInput["status"] })}
            >
              <option value="active">ใช้งาน</option>
              <option value="cancelled">ยกเลิก</option>
            </select>
          </Field>
          <Field label="รอบการจ่าย">
            <select
              className="field"
              value={form.billingCycle}
              onChange={(e) => {
                const billingCycle = e.target.value as BillingCycle;
                set({
                  billingCycle,
                  licenseType: billingCycle === "perpetual" ? "perpetual" : "subscription",
                });
              }}
            >
              {(Object.keys(CYCLE_NAMES) as BillingCycle[]).map((c) => (
                <option key={c} value={c}>
                  {CYCLE_NAMES[c]}
                </option>
              ))}
            </select>
          </Field>
          {form.billingCycle === "monthly" ? (
            <Field label="ตัดเงินทุกวันที่">
              <input
                className="field"
                inputMode="numeric"
                value={form.renewDay ?? ""}
                onChange={(e) => set({ renewDay: numberOrNull(e.target.value) })}
              />
            </Field>
          ) : (
            <Field label="จำนวน Seat">
              <input
                className="field tabular-nums"
                inputMode="numeric"
                value={form.seats ?? ""}
                onChange={(e) => set({ seats: numberOrNull(e.target.value) })}
              />
            </Field>
          )}
          <Field label="วันเริ่ม">
            <input
              type="date"
              className="field"
              value={form.startDate ?? ""}
              onChange={(e) => set({ startDate: e.target.value || null })}
            />
          </Field>
          <Field label={perpetual ? "วันหมดอายุ (ซื้อขาด ไม่มี)" : "วันหมดอายุ"}>
            <input
              type="date"
              className="field"
              disabled={perpetual}
              value={perpetual ? "" : (form.expireDate ?? "")}
              onChange={(e) => set({ expireDate: e.target.value || null })}
            />
          </Field>
          <Field label="ราคาต่อหน่วย (บาท)">
            <input
              className="field tabular-nums"
              inputMode="decimal"
              value={form.unitPrice ?? ""}
              onChange={(e) => set({ unitPrice: numberOrNull(e.target.value) })}
            />
          </Field>
          <Field label="ราคาต่อปี (บาท)">
            <input
              className="field tabular-nums"
              inputMode="decimal"
              placeholder={
                form.unitPrice !== null && form.seats
                  ? `เช่น ${baht(form.unitPrice * form.seats)}`
                  : undefined
              }
              value={form.pricePerYear ?? ""}
              onChange={(e) => set({ pricePerYear: numberOrNull(e.target.value) })}
            />
          </Field>
          <Field label="วิธีจ่าย">
            <select
              className="field"
              value={form.paymentMethod}
              onChange={(e) => set({ paymentMethod: e.target.value as PaymentMethod })}
            >
              {(Object.keys(PAYMENT_NAMES) as PaymentMethod[]).map((p) => (
                <option key={p} value={p}>
                  {p === "" ? "– ไม่ระบุ –" : PAYMENT_NAMES[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="บัตรที่ใช้ (4 ตัวท้าย)">
            <input
              className="field"
              placeholder="เช่น Mastercard ••1234"
              disabled={form.paymentMethod !== "card"}
              value={form.cardLabel}
              onChange={(e) => set({ cardLabel: e.target.value })}
            />
          </Field>
          <Field label="ผู้ขาย">
            <input className="field" value={form.vendor} onChange={(e) => set({ vendor: e.target.value })} />
          </Field>
          <Field label="ผู้ติดต่อ / เบอร์">
            <input
              className="field"
              value={form.vendorContact}
              onChange={(e) => set({ vendorContact: e.target.value })}
            />
          </Field>
          <Field label="หมายเหตุ" wide>
            <textarea
              className="field min-h-[64px]"
              value={form.remark}
              onChange={(e) => set({ remark: e.target.value })}
            />
          </Field>

          {editing && (
            <div className="sm:col-span-2">
              <div className="mb-1.5 text-sm font-medium">ประวัติการต่ออายุ</div>
              {renewals === null ? (
                <p className="text-xs text-muted">กำลังโหลด…</p>
              ) : renewals.length === 0 ? (
                <p className="text-xs text-muted">ยังไม่เคยต่ออายุในระบบ</p>
              ) : (
                <table className="sheet text-xs">
                  <thead>
                    <tr>
                      <th>ต่ออายุเมื่อ</th>
                      <th>รอบเดิม</th>
                      <th className="text-right">Seat</th>
                      <th className="text-right">บาท/ปี</th>
                      <th>หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renewals.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap">
                          {formatDate(r.renewedAt)}
                          <div className="text-faint">{r.renewedBy ?? ""}</div>
                        </td>
                        <td className="whitespace-nowrap">
                          {formatDate(r.startDate)} – {formatDate(r.expireDate)}
                        </td>
                        <td className="text-right tabular-nums">{r.seats ?? "–"}</td>
                        <td className="text-right tabular-nums">{baht(r.pricePerYear)}</td>
                        <td>{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600 sm:col-span-2">
              {error}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-line px-6 py-4">
          <div>
            {editing && (
              <button
                type="button"
                className="btn-text text-red-600"
                disabled={busy}
                onClick={() => void remove()}
              >
                ลบรายการนี้
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => dialog.current?.close()}>
              ยกเลิก
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

/** Renews a license for one more term; the old term goes to the history. */
export function RenewDialog({
  license,
  onSaved,
  onClose,
}: {
  license: SoftwareLicense;
  onSaved: (licenses: SoftwareLicense[]) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const suggested = nextTerm(license);
  const [startDate, setStartDate] = useState(suggested.startDate ?? "");
  const [expireDate, setExpireDate] = useState(suggested.expireDate ?? "");
  const [price, setPrice] = useState(license.pricePerYear === null ? "" : String(license.pricePerYear));
  const [seats, setSeats] = useState(license.seats === null ? "" : String(license.seats));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api.renewLicense(license.id, {
        startDate: startDate || null,
        expireDate: expireDate || null,
        pricePerYear: numberOrNull(price),
        seats: numberOrNull(seats),
        note,
      });
      onSaved(result.licenses);
      dialog.current?.close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="w-full max-w-lg rounded-2xl p-0 shadow-float backdrop:bg-black/30 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={submit} noValidate>
        <header className="border-b border-line px-6 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">ต่ออายุ {license.name}</h2>
          <p className="text-xs text-muted">
            {license.detail && `${license.detail} · `}รอบเดิม {formatDate(license.startDate)} –{" "}
            {formatDate(license.expireDate)} · รอบเดิมจะถูกเก็บในประวัติ
          </p>
        </header>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <Field label="วันเริ่มรอบใหม่">
            <input
              type="date"
              className="field"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="วันหมดอายุรอบใหม่">
            <input
              type="date"
              className="field"
              value={expireDate}
              onChange={(e) => setExpireDate(e.target.value)}
            />
          </Field>
          <Field label="ราคาต่อปี (บาท)">
            <input
              className="field tabular-nums"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label="จำนวน Seat">
            <input
              className="field tabular-nums"
              inputMode="numeric"
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
            />
          </Field>
          <Field label="หมายเหตุ เช่น เลขใบเสร็จ" wide>
            <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-red-600 sm:col-span-2">
              {error}
            </p>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <button type="button" className="btn-secondary" onClick={() => dialog.current?.close()}>
            ยกเลิก
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "กำลังบันทึก…" : "ต่ออายุ"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
