"use client";

import { ApiError } from "./api";
import { displayName } from "./format";
import type { Cycle, User } from "./types";

/**
 * Saving a confirmed appraisal form as PDF. The server prints the page with headless
 * Chromium (real, selectable text); here the browser asks where to save it.
 */

// The File System Access API is only in Chromium browsers and not yet in TypeScript's DOM types.
interface SaveFilePicker {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
}

/** Where the PDF goes: a file the user picked, or a plain download where picking is not supported. */
export type PdfTarget = { kind: "file"; handle: FileSystemFileHandle } | { kind: "download"; name: string };

export function pdfFileName(cycle: Cycle, employee: User): string {
  return `Appraisal ${cycle.id.replace(/\//g, "-")} ${employee.code} ${displayName(employee)}.pdf`;
}

/**
 * Opens the "Save As" dialog. Must be called straight from the click, before any other
 * waiting, or the browser refuses. Null when the user cancels.
 */
export async function choosePdfTarget(name: string): Promise<PdfTarget | null> {
  const picker = (window as unknown as SaveFilePicker).showSaveFilePicker;
  if (!picker) return { kind: "download", name };
  try {
    const handle = await picker({
      suggestedName: name,
      types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
    });
    return { kind: "file", handle };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}

/** `cycleId` null = the current cycle. */
export async function fetchPdf(employeeId: string, cycleId: string | null): Promise<Blob> {
  const query = cycleId ? `?cycle=${encodeURIComponent(cycleId)}` : "";
  let response: Response;
  try {
    response = await fetch(`/api/evaluations/${employeeId}/pdf${query}`, { cache: "no-store" });
  } catch {
    throw new ApiError(0, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, data?.error ?? "สร้าง PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  return response.blob();
}

export async function savePdf(target: PdfTarget, pdf: Blob): Promise<void> {
  if (target.kind === "file") {
    const writable = await target.handle.createWritable();
    await writable.write(pdf);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  link.href = url;
  link.download = target.name;
  link.click();
  // Give the browser a moment to start the download before the URL is released.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
