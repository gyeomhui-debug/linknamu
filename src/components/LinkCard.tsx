type LinkCardProps = {
  title: string;
  url: string;
  emoji?: string;
};

export default function LinkCard({ title, url, emoji }: LinkCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-5 py-4 text-center font-medium shadow-[0_2px_10px_-4px_rgba(120,70,40,0.18)] backdrop-blur-sm transition duration-200 hover:-translate-y-px hover:shadow-[0_6px_16px_-6px_rgba(120,70,40,0.28)] active:translate-y-0"
    >
      {emoji && (
        <span aria-hidden className="mr-2">
          {emoji}
        </span>
      )}
      {title}
    </a>
  );
}
