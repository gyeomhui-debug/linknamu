import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";
import {
  STATE_COOKIE,
  STATE_COOKIE_PATH,
  STATE_TTL_SECONDS,
  appBase,
  buildAuthorizeUrl,
  getOAuthConfig,
  newState,
} from "@/lib/github-oauth";

// 로그인 시작: CSRF 방지용 state 를 쿠키에 저장하고 GitHub 인가 화면으로 보낸다.
export async function GET(request: Request) {
  const base = appBase(request);
  const config = getOAuthConfig(base);
  if (!config) return NextResponse.redirect(new URL("/login?error=config", base));

  const state = newState();
  const res = NextResponse.redirect(buildAuthorizeUrl(config, state), 302);
  res.cookies.set(STATE_COOKIE, state, {
    ...sessionCookieOptions(),
    path: STATE_COOKIE_PATH,
    maxAge: STATE_TTL_SECONDS,
  });
  return res;
}
