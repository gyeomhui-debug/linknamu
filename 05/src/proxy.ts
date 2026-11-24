import { NextResponse, type NextRequest } from "next/server";

/**
 * 낙관적 검사(optimistic check): 세션 쿠키가 아예 없는 "페이지" 요청을 /login 으로 보낸다.
 * 쿠키가 있는지만 볼 뿐 유효한지는 확인하지 않는다 — 실제 인가는 모든 API 라우트의 requireUser 가 담당한다.
 * (proxy 는 느린 DB 조회를 하는 곳이 아니다. 만료·위조된 쿠키는 API 가 401 로 막고 클라이언트가 /login 으로 보낸다.)
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("sid")) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // API(자체 401)·로그인 흐름(/auth, /login)·정적 파일(_next, 확장자가 있는 경로)은 제외
  // api/auth/login 은 경로 세그먼트 단위로만 제외한다 (/authors 같은 다른 경로까지 빠지지 않도록)
  matcher: ["/((?!(?:api|auth|login)(?:/|$)|_next/static|_next/image|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
