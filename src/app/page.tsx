import LinkCard from "@/components/LinkCard";
import Profile from "@/components/Profile";

// 보여 주기용 더미 데이터 — 나중에 실제 내용으로 교체
const profile = {
  name: "김클로",
  bio: "세계 최강 바이브 코더",
  imageUrl: "https://i.pravatar.cc/256?img=12",
};

const links = [
  { id: 1, title: "GitHub", url: "https://github.com" },
  { id: 2, title: "LinkedIn", url: "https://www.linkedin.com" },
  { id: 3, title: "Blog", url: "https://example.com/blog" },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-12 sm:py-16">
      <Profile name={profile.name} bio={profile.bio} imageUrl={profile.imageUrl} />
      <ul className="mt-8 flex flex-col gap-6">
        {links.map((link) => (
          <li key={link.id}>
            <LinkCard title={link.title} url={link.url} />
          </li>
        ))}
      </ul>
    </main>
  );
}
