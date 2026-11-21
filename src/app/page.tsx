import LinkCard from "@/components/LinkCard";
import Profile from "@/components/Profile";

// 보여 주기용 더미 데이터 — 나중에 실제 내용으로 교체
const profile = {
  name: "김개발",
  bio: "풀스택 개발자|요즘에는 AI개발에 관심이 많아요",
  imageUrl: "https://placehold.co/192x192/orange/white",
};

const links = [
  { id: 1, title: "GitHub", url: "https://github.com", emoji: "🐙" },
  { id: 2, title: "LinkedIn", url: "https://www.linkedin.com", emoji: "🤝" },
  { id: 3, title: "Blog", url: "https://example.com/blog", emoji: "🐣" },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-16 sm:py-24">
      <Profile name={profile.name} bio={profile.bio} imageUrl={profile.imageUrl} />
      <ul className="mt-10 flex flex-col gap-4">
        {links.map((link) => (
          <li key={link.id}>
            <LinkCard title={link.title} url={link.url} emoji={link.emoji} />
          </li>
        ))}
      </ul>
    </main>
  );
}
