"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface ConfirmOptions {
  title: string;
  message?: string;
  /** Label of the "yes" button. */
  confirmLabel?: string;
  /** "danger" for deletes and other actions that cannot be undone. */
  tone?: "default" | "danger";
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

const ICONS = {
  default: "M10 6.5v4m0 3h.01M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z",
  danger: "M4.5 6h11M8 6V4.5h4V6m-6 0 .6 9.5h6.8L14 6M8.5 8.5v4.5m3-4.5v4.5",
};

/** Yes/no question in a modal at the centre of the screen; replaces window.confirm. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((answer: boolean) => void) | null>(null);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);

  const confirm = useCallback<Confirm>(
    (next) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setOptions(next);
      }),
    [],
  );

  // A native modal <dialog> opens above any dialog that is already open.
  useEffect(() => {
    if (options) dialog.current?.showModal();
  }, [options]);

  const settle = (answer: boolean) => {
    resolver.current?.(answer);
    resolver.current = null;
    setOptions(null);
  };

  const danger = options?.tone === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <dialog
          ref={dialog}
          onCancel={() => settle(false)}
          className="w-full max-w-sm rounded-2xl p-0 shadow-float backdrop:bg-black/30 backdrop:backdrop-blur-sm"
        >
          <div className="px-6 pb-5 pt-6 text-center">
            <div
              className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
                danger ? "bg-red-50 text-red-500" : "bg-accent-soft text-accent"
              }`}
            >
              <svg
                viewBox="0 0 20 20"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={danger ? ICONS.danger : ICONS.default} />
              </svg>
            </div>
            <h2 className="text-[17px] font-semibold tracking-tight">{options.title}</h2>
            {options.message && <p className="mt-1.5 text-sm text-muted">{options.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-line px-6 py-4">
            <button type="button" className="btn-secondary" onClick={() => settle(false)}>
              ยกเลิก
            </button>
            <button
              type="button"
              autoFocus
              className={danger ? "btn-danger" : "btn-primary"}
              onClick={() => settle(true)}
            >
              {options.confirmLabel ?? "ยืนยัน"}
            </button>
          </div>
        </dialog>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside ConfirmProvider");
  return confirm;
}
