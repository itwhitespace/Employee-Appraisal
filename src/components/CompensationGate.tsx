"use client";

import { useEffect, useState } from "react";
import PasswordField, { toDigits } from "@/components/PasswordField";
import { api, COMPENSATION_LOCKED, errorMessage } from "@/lib/api";

/** Asked for from outside, e.g. the lock button in the menu. */
export const LOCK_NOW = "compensation-lock-now";

type Stage = "loading" | "setup" | "locked" | "open";

/**
 * The compensation pages behind their own password. Nothing under it is shown, or even
 * loaded, until the password is given. When the pages lock again (30 minutes without use, or
 * the lock button), the screen covers them but keeps them mounted, so unsaved edits survive.
 */
export default function CompensationGate({ children }: { children: React.ReactNode }) {
  const [stage, setStage] = useState<Stage>("loading");
  /** Opened at least once: the pages are mounted and stay so under the lock screen. */
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .compensationLock()
      .then((state) => {
        if (state.unlocked) {
          setStage("open");
          setMounted(true);
        } else setStage(state.hasPassword ? "locked" : "setup");
      })
      .catch((e) => setError(errorMessage(e)));
    const relock = () => setStage((current) => (current === "open" ? "locked" : current));
    const lockNow = () => {
      void api.lockCompensation().catch(() => undefined);
      relock();
    };
    window.addEventListener(COMPENSATION_LOCKED, relock);
    window.addEventListener(LOCK_NOW, lockNow);
    return () => {
      window.removeEventListener(COMPENSATION_LOCKED, relock);
      window.removeEventListener(LOCK_NOW, lockNow);
    };
  }, []);

  const opened = () => {
    setStage("open");
    setMounted(true);
    setError(null);
  };

  return (
    <>
      {stage !== "open" && (
        <LockScreen stage={stage} error={error} onError={setError} onOpen={opened} relocked={mounted} />
      )}
      {mounted && <div hidden={stage !== "open"}>{children}</div>}
    </>
  );
}

function LockScreen({
  stage,
  error,
  onError,
  onOpen,
  relocked,
}: {
  stage: Stage;
  error: string | null;
  onError: (message: string | null) => void;
  onOpen: () => void;
  relocked: boolean;
}) {
  const [password, setPassword] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    onError(null);
    if (stage === "setup") {
      if (!/^\d{8}$/.test(newPassword)) return onError("รหัสผ่านค่าตอบแทนต้องเป็นตัวเลข 8 หลัก");
      if (newPassword !== confirmPassword) return onError("รหัสผ่านใหม่สองช่องไม่ตรงกัน");
    }
    setBusy(true);
    try {
      if (stage === "setup") await api.setupCompensationPassword(loginPassword, newPassword);
      else await api.unlockCompensation(password);
      setPassword("");
      setLoginPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onOpen();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (stage === "loading") {
    return error ? (
      <div className="card p-8 text-center text-red-500">{error}</div>
    ) : (
      <div className="card p-8 text-center text-muted">กำลังตรวจสอบ…</div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <form onSubmit={submit} noValidate className="card w-full max-w-md space-y-4 px-7 py-7">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
            <svg
              viewBox="0 0 20 20"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <rect x="4" y="9" width="12" height="8" rx="1.5" />
              <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
            </svg>
          </span>
          <h1 className="text-xl font-semibold text-teal-900">
            {stage === "setup" ? "ตั้ง PIN ค่าตอบแทน" : "เมนูค่าตอบแทนถูกล็อก"}
          </h1>
          <p className="text-sm text-muted">
            {stage === "setup"
              ? "ครั้งแรก: ยืนยันรหัสเข้าระบบ แล้วตั้งรหัส PIN 8 หลักสำหรับเมนูนี้โดยเฉพาะ"
              : relocked
                ? "ล็อกอัตโนมัติเมื่อไม่ได้ใช้งาน 30 นาที หรือกดล็อกเอง · ข้อมูลที่กรอกค้างไว้ยังอยู่"
                : "ใส่ PIN ค่าตอบแทน 8 หลักเพื่อเข้าใช้งาน"}
          </p>
        </div>

        {stage === "setup" ? (
          <>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">รหัสเข้าระบบ (5 หลัก)</span>
              <PasswordField
                inputMode="numeric"
                autoComplete="current-password"
                className="field"
                value={loginPassword}
                onChange={(e) => setLoginPassword(toDigits(e.target.value).slice(0, 5))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">PIN ค่าตอบแทนใหม่ (ตัวเลข 8 หลัก)</span>
              <PasswordField
                inputMode="numeric"
                autoComplete="new-password"
                className="field text-center text-lg font-semibold tracking-[0.3em] tabular-nums"
                value={newPassword}
                onChange={(e) => setNewPassword(toDigits(e.target.value).slice(0, 8))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">ยืนยัน PIN ค่าตอบแทนใหม่</span>
              <PasswordField
                inputMode="numeric"
                autoComplete="new-password"
                className="field text-center text-lg font-semibold tracking-[0.3em] tabular-nums"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(toDigits(e.target.value).slice(0, 8))}
              />
            </label>
          </>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">PIN ค่าตอบแทน (8 หลัก)</span>
            <PasswordField
              inputMode="numeric"
              autoComplete="current-password"
              autoFocus
              className="field text-center text-lg font-semibold tracking-[0.3em] tabular-nums"
              value={password}
              onChange={(e) => setPassword(toDigits(e.target.value).slice(0, 8))}
            />
          </label>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "กำลังตรวจสอบ…" : stage === "setup" ? "ตั้ง PIN และเข้าใช้งาน" : "ปลดล็อก"}
        </button>
        <p className="text-center text-xs text-faint">
          ลืม PIN ค่าตอบแทน: ให้ IT รีเซ็ต แล้วตั้งใหม่ด้วยรหัสเข้าระบบ
        </p>
      </form>
    </div>
  );
}
