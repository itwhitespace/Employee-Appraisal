"use client";

import { displayName } from "./format";
import type { Cycle, User } from "./types";

/**
 * Saving an appraisal form as PDF in the browser. The form on screen is captured block by
 * block (header, summary, each section) and laid out on landscape A4 pages, so the PDF
 * looks like the page; its text is part of the images and cannot be selected.
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

const PAGE_WIDTH = 297;
const PAGE_HEIGHT = 210;
const MARGIN = 8;
const GAP = 4;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN;

/** Each direct child of `root` is a block; a block taller than a page is split across pages. */
export async function renderPdf(root: HTMLElement): Promise<Blob> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  await document.fonts.ready;

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let y = MARGIN;

  const blocks = Array.from(root.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && !child.classList.contains("print:hidden") && child.offsetHeight > 0,
  );

  for (const block of blocks) {
    const canvas = await toCanvas(block, {
      pixelRatio: 1.5,
      backgroundColor: "#ffffff",
      // Buttons and hints that the printed page leaves out are left out here too.
      filter: (node) => !(node instanceof HTMLElement && node.classList.contains("print:hidden")),
    });
    const mmPerPixel = CONTENT_WIDTH / canvas.width;
    const height = canvas.height * mmPerPixel;

    // Start a fresh page rather than split a block that would fit on one.
    if (y > MARGIN && y + height > CONTENT_BOTTOM && height <= CONTENT_BOTTOM - MARGIN) {
      pdf.addPage();
      y = MARGIN;
    }

    let offset = 0;
    while (offset < canvas.height) {
      const room = Math.floor((CONTENT_BOTTOM - y) / mmPerPixel);
      if (room <= 0) {
        pdf.addPage();
        y = MARGIN;
        continue;
      }
      const slice = Math.min(canvas.height - offset, room);
      const part = document.createElement("canvas");
      part.width = canvas.width;
      part.height = slice;
      part.getContext("2d")?.drawImage(canvas, 0, offset, canvas.width, slice, 0, 0, canvas.width, slice);
      pdf.addImage(part.toDataURL("image/jpeg", 0.88), "JPEG", MARGIN, y, CONTENT_WIDTH, slice * mmPerPixel);
      offset += slice;
      y += slice * mmPerPixel;
    }
    y += GAP;
  }

  return pdf.output("blob");
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
