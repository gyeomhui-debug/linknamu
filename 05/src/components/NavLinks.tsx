"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/", label: "일일 보드" },
  { href: "/weeks", label: "주간 계획" },
  { href: "/goals", label: "1년 목표" },
] as const;

/** 상단 탭. 활성 탭은 잉크 글자 + 2px 밑줄, 나머지는 muted. */
export default function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center self-stretch whitespace-nowrap font-semibold ${
              active ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground" : "text-muted"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
