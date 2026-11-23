import LinkList from "@/components/LinkList";
import Profile from "@/components/Profile";
import { links } from "@/lib/links";

// 보여 주기용 더미 데이터 — 나중에 실제 내용으로 교체
const profile = {
  name: "김개발",
  bio: "풀스택 개발자|요즘에는 AI개발에 관심이 많아요",
  imageUrl: "https://placehold.co/192x192/orange/white",
};

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-16 sm:py-24">
      <Profile name={profile.name} bio={profile.bio} imageUrl={profile.imageUrl} />
      <LinkList links={links} />
    </main>
  );
}
