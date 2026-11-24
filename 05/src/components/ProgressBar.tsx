export default function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--hairline-soft)]"
      >
        <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${value}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-muted">{value}%</span>
    </div>
  );
}
