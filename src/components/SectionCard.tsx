interface SectionCardProps {
  letter: string;
  title: string;
  subtitle?: string;
  /** Short label on the right of the header, e.g. the section weight. */
  badge?: string;
  /** Sections outside the Performance Score get a neutral letter mark. */
  muted?: boolean;
  children: React.ReactNode;
}

export default function SectionCard({ letter, title, subtitle, badge, muted, children }: SectionCardProps) {
  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
              muted ? "bg-black/5 text-ink" : "bg-accent text-white"
            }`}
          >
            {letter}
          </span>
          <div>
            <h2 className="text-[17px] font-semibold leading-snug tracking-tight">{title}</h2>
            {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          </div>
        </div>
        {badge && <span className="chip bg-black/5 text-muted">{badge}</span>}
      </header>
      <div className="border-t border-line">{children}</div>
    </section>
  );
}
