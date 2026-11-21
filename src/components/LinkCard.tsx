type LinkCardProps = {
  title: string;
  url: string;
};

export default function LinkCard({ title, url }: LinkCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full rounded-xl border-2 border-zinc-800 bg-white px-5 py-4 text-center font-medium shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-50 hover:shadow-md active:translate-y-0 dark:border-zinc-300 dark:bg-zinc-900 dark:hover:bg-zinc-800"
    >
      {title}
    </a>
  );
}
