"use client";

import { useState } from "react";

/** Thai digits and the number row of the Thai (Kedmanee) keyboard, as typed by mistake. */
const THAI_KEYS: Record<string, string> = {
  "๐": "0",
  "๑": "1",
  "๒": "2",
  "๓": "3",
  "๔": "4",
  "๕": "5",
  "๖": "6",
  "๗": "7",
  "๘": "8",
  "๙": "9",
  ๅ: "1",
  "/": "2",
  "-": "3",
  ภ: "4",
  ถ: "5",
  "ุ": "6",
  "ึ": "7",
  ค: "8",
  ต: "9",
  จ: "0",
};

/**
 * Digits only, for codes and 5-digit passwords. Keys pressed with the keyboard left in Thai
 * become the digits they stand for, instead of silently disappearing.
 */
export const toDigits = (text: string) =>
  [...text]
    .map((ch) => THAI_KEYS[ch] ?? ch)
    .join("")
    .replace(/\D/g, "");

const EYE =
  "M2.5 10s2.8-5.5 7.5-5.5 7.5 5.5 7.5 5.5-2.8 5.5-7.5 5.5S2.5 10 2.5 10ZM10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z";
const EYE_OFF =
  "M3 3l14 14M8.2 8.3a2.5 2.5 0 0 0 3.5 3.5M6 6.2C3.8 7.6 2.5 10 2.5 10s2.8 5.5 7.5 5.5c1.5 0 2.8-.5 3.9-1.2M9 4.6c.3 0 .7-.1 1-.1 4.7 0 7.5 5.5 7.5 5.5s-.7 1.4-2 2.8";

/** A password input with a button to show what was typed. */
export default function PasswordField({
  className = "",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className={`${className} pr-11`} />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        aria-label={shown ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-faint hover:text-ink"
      >
        <svg
          viewBox="0 0 20 20"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={shown ? EYE_OFF : EYE} />
        </svg>
      </button>
    </div>
  );
}
