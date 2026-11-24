import { NextResponse } from "next/server";
import {
  createSession,
  destroySession,
  readCookie,
  sessionCookieOptions,
  sessionTokenFromRequest,
  setSessionCookie,
  upsertGithubUser,
} from "@/lib/auth";
import {
  STATE_COOKIE,
  STATE_COOKIE_PATH,
  appBase,
  exchangeCodeForToken,
  fetchGithubProfile,
  getOAuthConfig,
  statesMatch,
  type LoginErrorCode,
} from "@/lib/github-oauth";

// GitHub 가 인가 코드를 들고 돌아오는 곳. state 검증 → 토큰 교환 → 프로필 조회 → 사용자 upsert → 세션 발급.
export async function GET(request: Request) {
  const base = appBase(request);
  const url = new URL(request.url);

  // 어떤 실패든 state 쿠키는 한 번 쓰고 버린다
  const clearState = <T extends NextResponse>(res: T): T => {
    res.cookies.set(STATE_COOKIE, "", { ...sessionCookieOptions(), path: STATE_COOKIE_PATH, maxAge: 0 });
    return res;
  };
  const fail = (code: LoginErrorCode) => clearState(NextResponse.redirect(new URL(`/login?error=${code}`, base)));

  const config = getOAuthConfig(base);
  if (!config) return fail("config");
  if (url.searchParams.has("error")) return fail("denied"); // 사용자가 GitHub 에서 취소 (access_denied 등)

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = readCookie(request.headers.get("cookie"), STATE_COOKIE);
  if (!code || !state || !expected || !statesMatch(state, expected)) return fail("state");

  try {
    const accessToken = await exchangeCodeForToken(config, code);
    const profile = await fetchGithubProfile(accessToken);
    const user = await upsertGithubUser(profile);

    // 이미 로그인된 브라우저라면 이전 세션은 폐기하고 새 세션을 발급한다(세션 고정 방지)
    await destroySession(sessionTokenFromRequest(request));
    const { token } = await createSession(user._id);
    return clearState(setSessionCookie(NextResponse.redirect(new URL("/", base)), token));
  } catch (e) {
    // 메시지에는 HTTP 상태·GitHub 오류 코드만 들어 있고 비밀 값은 없다
    console.error("GitHub 로그인 실패:", e instanceof Error ? e.message : e);
    return fail("github");
  }
}
