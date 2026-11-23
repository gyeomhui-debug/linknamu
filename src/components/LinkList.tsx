"use client";

import { useEffect, useState } from "react";
import LinkCard from "@/components/LinkCard";

type LinkItem = { id: number; title: string; url: string; emoji?: string };

export default function LinkList({ links }: { links: LinkItem[] }) {
  // 데이터를 받기 전에는 비어 있고, 카드는 0회로 표시
  const [clicks, setClicks] = useState<Record<number, number>>({});

  useEffect(() => {
    fetch("/api/clicks")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: Record<number, number>) => setClicks(data))
      .catch(() => {});
  }, []);

  function handleClick(id: number) {
    // 화면에는 바로 반영하고, 서버 저장은 페이지 이동과 무관하게 전송
    setClicks((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    fetch("/api/clicks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
      keepalive: true,
    }).catch(() => {});
  }

  return (
    <ul className="mt-10 flex flex-col gap-4">
      {links.map((link) => (
        <li key={link.id}>
          <LinkCard
            title={link.title}
            url={link.url}
            emoji={link.emoji}
            clicks={clicks[link.id] ?? 0}
            onClick={() => handleClick(link.id)}
          />
        </li>
      ))}
    </ul>
  );
}
