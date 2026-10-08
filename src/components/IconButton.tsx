import Link from "next/link";

/** SVG path data, drawn on a 20x20 grid. */
const ICONS = {
  view: "M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5Zm7.5 2.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z",
  edit: "M4 16l.6-3.1 8.3-8.3a1.5 1.5 0 0 1 2.1 0l.4.4a1.5 1.5 0 0 1 0 2.1l-8.3 8.3L4 16Zm7.4-9.9 2.5 2.5",
  delete: "M4.5 6h11M8 6V4.5h4V6m-6 0 .6 9.5h6.8L14 6M8.5 8.5v4.5m3-4.5v4.5",
  save: "M4.5 10.5l3.5 3.5 7.5-8",
};

interface IconButtonProps {
  icon: keyof typeof ICONS;
  /** Shown as the tooltip and read by screen readers. */
  label: string;
  /** Renders a link instead of a button. */
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}

/** Compact icon-only action for table rows. */
export default function IconButton({ icon, label, href, onClick, disabled, tone }: IconButtonProps) {
  const className = `inline-flex h-8 w-8 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent ${
    tone === "danger" ? "text-red-500 hover:bg-red-50" : "text-accent hover:bg-accent-soft"
  }`;
  const glyph = (
    <svg
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[icon]} />
    </svg>
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-label={label} title={label}>
        {glyph}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {glyph}
    </button>
  );
}
