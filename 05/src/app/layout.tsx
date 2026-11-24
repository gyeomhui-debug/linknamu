import type { Metadata } from "next";
import Link from "next/link";
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
          <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm font-medium">
            <span className="font-bold">할 일 플래너</span>
            {user && (
              <>
                <Link href="/dashboard" className="hover:text-accent">대시보드</Link>
                <Link href="/" className="hover:text-accent">일일 보드</Link>
                <Link href="/weeks" className="hover:text-accent">주간 계획</Link>
                <Link href="/goals" className="hover:text-accent">1년 목표</Link>
              </>
            )}
            <div className="ml-auto flex items-center gap-2">
              {user ? (
                <>
                  {/* GitHub 아바타(https 만 저장됨). next/image 는 원격 도메인 설정이 필요해 일반 img 를 쓴다 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={user.avatar_url} alt="" width={24} height={24} referrerPolicy="no-referrer" className="rounded-full" />
                  <span className="max-w-32 truncate">{user.username}</span>
                  <form action="/auth/logout" method="post">
                    <button type="submit" className="rounded px-2 py-1 text-xs text-muted hover:bg-black/5">
                      로그아웃
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="hover:text-accent">로그인</Link>
              )}
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
