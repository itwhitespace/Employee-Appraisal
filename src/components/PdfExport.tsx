"use client";

import { createPortal } from "react-dom";
import { errorMessage } from "@/lib/api";
import { renderPdf, savePdf, type PdfTarget } from "@/lib/pdf";
import EvaluationForm from "./EvaluationForm";

export interface PdfJob {
  employeeId: string;
  /** Null for the current cycle. */
  cycleId: string | null;
  target: PdfTarget;
}

interface PdfExportProps {
  job: PdfJob;
  /** Called with null once the file is saved, or with the reason it was not. */
  onDone: (error: string | null) => void;
}

/**
 * Lays the form out off screen at a fixed width, whatever the size of the window,
 * and turns it into a PDF.
 */
export default function PdfExport({ job, onDone }: PdfExportProps) {
  return createPortal(
    <div className="pdf-capture fixed left-[-20000px] top-0 w-[1240px]" aria-hidden="true">
      <EvaluationForm
        employeeId={job.employeeId}
        cycleId={job.cycleId}
        onLoadError={onDone}
        onRendered={async (root) => {
          try {
            await savePdf(job.target, await renderPdf(root));
            onDone(null);
          } catch (e) {
            onDone(errorMessage(e));
          }
        }}
      />
    </div>,
    document.body,
  );
}
