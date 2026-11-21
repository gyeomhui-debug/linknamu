type ProfileProps = {
  name: string;
  bio: string;
  imageUrl?: string;
};

export default function Profile({ name, bio, imageUrl }: ProfileProps) {
  return (
    <header className="flex flex-col items-center text-center">
      <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-4xl font-bold text-orange-700 shadow-[0_12px_28px_-8px_rgba(180,100,50,0.45)] ring-4 ring-white/90 dark:ring-white/10 sm:h-32 sm:w-32">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={`${name} 프로필 사진`} className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden>{name.charAt(0)}</span>
        )}
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight">{name}</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted sm:text-base">{bio}</p>
    </header>
  );
}
