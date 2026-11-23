"use client";

type LinkCardProps = {
  title: string;
  url: string;
  emoji?: string;
  clicks: number;
  onClick?: () => void;
};

export default function LinkCard({ title, url, emoji, clicks, onClick }: LinkCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="relative block w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-5 py-4 text-center font-medium shadow-[0_2px_10px_-4px_rgba(120,70,40,0.18)] backdrop-blur-sm transition duration-200 hover:-translate-y-px hover:shadow-[0_6px_16px_-6px_rgba(120,70,40,0.28)] active:translate-y-0"
    >
      {emoji && (
        <span aria-hidden className="mr-2">
          {emoji}
        </span>
      )}
      {title}
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-normal opacity-60">
        {clicks.toLocaleString("ko-KR")}회
      </span>
    </a>
  );
}
