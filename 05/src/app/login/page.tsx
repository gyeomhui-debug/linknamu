import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { LOGIN_ERRORS, isLoginErrorCode } from "@/lib/github-oauth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/");

  const { error } = await searchParams;
  // 쿼리 문자열을 그대로 보여 주지 않고, 알려진 코드에 대응하는 고정 문구만 보여 준다.
  const message = isLoginErrorCode(error) ? LOGIN_ERRORS[error] : null;

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <div className="rounded-2xl border border-[var(--card-border)] bg-card p-6 text-center">
        <h1 className="text-lg font-bold">할 일 플래너</h1>
        <p className="mt-1 text-sm text-muted">GitHub 계정으로 로그인하면 내 목표와 할 일을 어디서든 볼 수 있어요.</p>
        {message && (
          <p role="alert" className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {message}
          </p>
        )}
        {/* 서버가 GitHub 로 리다이렉트하는 라우트라 next/link 대신 일반 링크를 쓴다 */}
        <a href="/auth/github" className="mt-5 inline-block w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white">
          GitHub 로 로그인
        </a>
      </div>
    </main>
  );
}
