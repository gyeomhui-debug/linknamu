import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "할 일 플래너",
  description: "일일 할 일을 주간 계획과 1년 목표에 연결해 관리합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">
        <header className="border-b border-[var(--card-border)] bg-card">
          <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm font-medium">
            <span className="font-bold">할 일 플래너</span>
            <Link href="/" className="hover:text-accent">일일 보드</Link>
            <Link href="/weeks" className="hover:text-accent">주간 계획</Link>
            <Link href="/goals" className="hover:text-accent">1년 목표</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
