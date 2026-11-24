import type { Metadata } from "next";
import Link from "next/link";
import NavLinks from "@/components/NavLinks";
import { getCurrentUser } from "@/lib/current-user";
import "./globals.css";

export const metadata: Metadata = {
  title: "할 일 플래너",
  description: "일일 할 일을 주간 계획과 1년 목표에 연결해 관리합니다.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">
        <header className="border-b border-[var(--card-border)] bg-card">
          <nav className="mx-auto flex h-16 max-w-5xl items-center gap-5 px-4 text-sm sm:h-20 sm:gap-7 sm:text-base">
            <Link href="/" className="whitespace-nowrap text-lg font-bold tracking-tight text-accent sm:text-xl">
              할 일 플래너
            </Link>
            {user && <NavLinks />}
            <div className="ml-auto flex items-center gap-2">
              {user ? (
                <>
                  {/* GitHub 아바타(https 만 저장됨). next/image 는 원격 도메인 설정이 필요해 일반 img 를 쓴다 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={user.avatar_url} alt="" width={32} height={32} referrerPolicy="no-referrer" className="rounded-full" />
                  <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">{user.username}</span>
                  <form action="/auth/logout" method="post">
                    <button type="submit" className="btn-outline px-3 py-1.5 text-xs">
                      로그아웃
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="font-semibold text-accent">로그인</Link>
              )}
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
