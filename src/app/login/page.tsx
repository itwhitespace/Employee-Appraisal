"use client";

import Image from "next/image";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { COMPANY_NAME } from "@/lib/constants";

export default function LoginPage() {
  const { login } = useAuth();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{5}$/.test(code)) {
      setError("กรุณากรอกรหัสพนักงาน 5 หลัก");
      return;
    }
    if (!password) {
      setError("กรุณากรอกรหัสผ่าน");
      return;
    }
    setBusy(true);
    // On success AppShell redirects to the role's landing page.
    setError(await login(code, password));
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Image
            src="/logo.png"
            alt={COMPANY_NAME}
            width={502}
            height={120}
            priority
            className="mx-auto h-auto w-52"
          />
          <h1 className="mt-5 text-[32px] font-semibold leading-tight tracking-tight">
            Performance Appraisal
          </h1>
          <p className="mt-2 text-sm text-muted">เข้าสู่ระบบด้วยรหัสพนักงานและรหัสผ่านของคุณ</p>
        </div>

        <form onSubmit={submit} className="card p-6" noValidate>
          <label htmlFor="code" className="mb-1.5 block text-sm font-medium">
            รหัสพนักงาน (5 หลัก)
          </label>
          <input
            id="code"
            className="field py-3 text-center text-xl font-semibold tracking-[0.4em] tabular-nums"
            inputMode="numeric"
            autoComplete="username"
            autoFocus
            maxLength={5}
            placeholder="00000"
            value={code}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "code-error" : undefined}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 5));
              setError(null);
            }}
          />
          <label htmlFor="password" className="mb-1.5 mt-4 block text-sm font-medium">
            รหัสผ่าน (เลขบัตรประชาชน 5 ตัวท้าย)
          </label>
          <input
            id="password"
            type="password"
            className="field py-3 text-center text-xl font-semibold tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={64}
            placeholder="•••••"
            value={password}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "code-error" : undefined}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
          />
          {error && (
            <p id="code-error" role="alert" className="mt-2 text-sm text-red-500">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary mt-5 w-full py-2.5" disabled={busy}>
            {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}
