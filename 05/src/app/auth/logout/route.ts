import { NextResponse } from "next/server";
import { clearSessionCookie, destroySession, sessionTokenFromRequest } from "@/lib/auth";
import { appBase } from "@/lib/github-oauth";

// 로그아웃은 POST 만 받는다(GET 은 Next 가 405). SameSite=Lax 쿠키라 다른 사이트의 폼 POST 로는 세션이 실리지 않는다.
export async function POST(request: Request) {
  const res = clearSessionCookie(NextResponse.redirect(new URL("/login", appBase(request)), 303));
  try {
    // 서버의 세션 문서를 지워야 "완전 삭제"다. 쿠키만 지우면 토큰이 유출된 경우 계속 쓸 수 있다.
    await destroySession(sessionTokenFromRequest(request));
  } catch (e) {
    console.error("세션 삭제 실패:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "로그아웃하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
  return res;
}
