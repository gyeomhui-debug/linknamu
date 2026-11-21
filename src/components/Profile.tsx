type ProfileProps = {
  name: string;
  bio: string;
  imageUrl?: string;
};

export default function Profile({ name, bio, imageUrl }: ProfileProps) {
  return (
    <header className="flex flex-col items-center text-center">
      <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-full border-2 border-emerald-700 bg-emerald-100 text-5xl font-bold text-emerald-800 sm:h-48 sm:w-48">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={`${name} 프로필 사진`} className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden>{name.charAt(0)}</span>
        )}
      </div>
      <h1 className="mt-5 text-xl font-bold sm:text-2xl">{name}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">{bio}</p>
    </header>
  );
}
