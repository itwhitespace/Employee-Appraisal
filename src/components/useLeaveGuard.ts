"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useConfirm } from "./ConfirmDialog";

/**
 * While there are unsaved edits, asks before they are lost: the browser's own prompt when the
 * tab is closed or reloaded, and a dialog when a link inside the app is followed.
 */
export function useLeaveGuard(dirty: boolean) {
  const confirm = useConfirm();
  const router = useRouter();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      // Links opened in another tab leave this page as it is.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      void confirm({
        title: "ออกจากหน้านี้โดยไม่บันทึก?",
        message: "ข้อมูลที่แก้ไขไว้และยังไม่ได้บันทึกจะหายไป",
        confirmLabel: "ละทิ้งและออก",
        tone: "danger",
      }).then((leave) => {
        if (leave) router.push(url.pathname + url.search);
      });
    };
    window.addEventListener("beforeunload", warn);
    // Capture phase: runs before Next's Link handles the click.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, confirm, router]);
}
