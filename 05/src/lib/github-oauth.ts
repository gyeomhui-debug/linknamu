// 서버 전용: GitHub OAuth(인가 코드 흐름) 헬퍼. 비밀 값은 환경 변수에서만 읽는다.
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { GithubProfile } from "./auth";

export const STATE_COOKIE = "oauth_state";
export const STATE_TTL_SECONDS = 10 * 60;
/** 콜백 경로에만 보내도록 쿠키 범위를 좁힌다. */
export const STATE_COOKIE_PATH = "/auth/github";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const TIMEOUT_MS = 10_000;

export type OAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** 로그인 실패 사유 코드. 화면에는 이 코드에 대응하는 고정 문구만 보여 준다(임의 문자열을 반사하지 않음). */
export const LOGIN_ERRORS = {
  config: "로그인 설정이 아직 완료되지 않았습니다. 관리자에게 문의해 주세요.",
  denied: "GitHub 로그인이 취소되었습니다.",
  state: "로그인 요청이 유효하지 않거나 만료되었습니다. 다시 시도해 주세요.",
  github: "GitHub 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
} as const;
export type LoginErrorCode = keyof typeof LOGIN_ERRORS;

export function isLoginErrorCode(v: unknown): v is LoginErrorCode {
  return typeof v === "string" && Object.hasOwn(LOGIN_ERRORS, v);
}

/** 리다이렉트·redirect_uri 의 기준 주소. APP_URL 이 있으면 그것을, 없으면 요청의 origin 을 쓴다. */
export function appBase(request: Request, env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.APP_URL?.trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      // 잘못된 APP_URL 은 무시하고 요청 origin 으로 대체
    }
  }
  return new URL(request.url).origin;
}

/** 환경 변수가 하나라도 없으면 null(운영에서는 APP_URL 도 필수). 비밀 값은 소스에 두지 않는다. */
export function getOAuthConfig(base: string, env: NodeJS.ProcessEnv = process.env): OAuthConfig | null {
  const clientId = env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = env.GITHUB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  // 운영에서는 Host 헤더에서 온 origin 으로 콜백·리다이렉트 주소를 만들지 않는다(프록시 설정 실수 방어)
  if (env.NODE_ENV === "production" && !env.APP_URL?.trim()) return null;
  return { clientId, clientSecret, redirectUri: `${base}/auth/github/callback` };
}

export function newState(): string {
  return randomBytes(24).toString("base64url");
}

/** 타이밍 공격을 피하는 비교. 길이가 다르면 바로 false. */
export function statesMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function buildAuthorizeUrl(config: OAuthConfig, state: string): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("client_id", config.clientId);
  u.searchParams.set("redirect_uri", config.redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("scope", "read:user");
  return u.toString();
}

type FetchFn = typeof fetch;

/** code → access_token. GitHub 는 실패해도 200 + { error } 로 답하므로 본문을 반드시 확인한다. */
export async function exchangeCodeForToken(config: OAuthConfig, code: string, fetchFn: FetchFn = fetch): Promise<string> {
  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub 토큰 교환 실패 (HTTP ${res.status})`);
  const data = (await res.json().catch(() => null)) as { access_token?: unknown; error?: unknown } | null;
  if (!data || typeof data.access_token !== "string" || !data.access_token) {
    throw new Error(`GitHub 토큰 교환 실패 (${typeof data?.error === "string" ? data.error : "응답 형식 오류"})`);
  }
  return data.access_token;
}

/** GitHub /user 응답 검증. avatar_url 은 <img src> 로 쓰이므로 https 만 허용한다. */
export function parseGithubUser(data: unknown): GithubProfile | null {
  if (!data || typeof data !== "object") return null;
  const { id, login, avatar_url } = data as Record<string, unknown>;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;
  if (typeof login !== "string" || login.length === 0 || login.length > 100) return null;
  if (typeof avatar_url !== "string") return null;
  try {
    if (new URL(avatar_url).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { github_id: id, username: login, avatar_url };
}

export async function fetchGithubProfile(accessToken: string, fetchFn: FetchFn = fetch): Promise<GithubProfile> {
  const res = await fetchFn(USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "todo-planner",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub 프로필 조회 실패 (HTTP ${res.status})`);
  const profile = parseGithubUser(await res.json().catch(() => null));
  if (!profile) throw new Error("GitHub 프로필 응답 형식이 올바르지 않습니다.");
  return profile;
}
