// /auth/github, /auth/github/callback 라우트 핸들러 테스트. GitHub 는 모의 fetch, DB 는 인메모리 가짜.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeCollections } from "./test-utils/fake-db";

let db: FakeCollections;
vi.mock("@/lib/mongodb", () => ({ getCollections: async () => db }));

import * as callback from "@/app/auth/github/callback/route";
import * as start from "@/app/auth/github/route";
import { SESSION_COOKIE, createSession, findUserByToken, hashToken, upsertGithubUser } from "./auth";
import { STATE_COOKIE } from "./github-oauth";

const BASE = "http://localhost:3000";
const SECRET = "super-secret-value-123";
const ghUser = { id: 583231, login: "octocat", avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4" };

function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}
function cookieValue(res: Response, name: string): string | undefined {
  const c = setCookies(res).find((x) => x.startsWith(`${name}=`));
  return c?.split(";")[0].slice(name.length + 1);
}
const callbackReq = (qs: string, cookie?: string) =>
  new Request(`${BASE}/auth/github/callback?${qs}`, { headers: cookie ? { cookie } : {} });

/** GitHub 모의: 토큰 교환과 /user 응답을 순서대로 돌려준다. */
function mockGithub(opts: { token?: unknown; profile?: unknown; tokenStatus?: number; profileStatus?: number } = {}) {
  const f = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("/login/oauth/access_token")) {
      return new Response(JSON.stringify(opts.token ?? { access_token: "gho_token" }), { status: opts.tokenStatus ?? 200 });
    }
    if (u.includes("api.github.com/user")) {
      return new Response(JSON.stringify(opts.profile ?? ghUser), { status: opts.profileStatus ?? 200 });
    }
    throw new Error(`예상하지 못한 fetch: ${u}`);
  });
  vi.stubGlobal("fetch", f);
  return f;
}

beforeEach(() => {
  db = createFakeDb();
  vi.stubEnv("GITHUB_CLIENT_ID", "client-id-123");
  vi.stubEnv("GITHUB_CLIENT_SECRET", SECRET);
  vi.stubEnv("APP_URL", BASE);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /auth/github", () => {
  it("GitHub 인가 URL 로 302, state 가 쿠키와 URL 에 같은 값으로 들어가고 비밀은 노출되지 않는다", async () => {
    const res = await start.GET(new Request(`${BASE}/auth/github`));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(loc.searchParams.get("client_id")).toBe("client-id-123");
    expect(loc.searchParams.get("redirect_uri")).toBe(`${BASE}/auth/github/callback`);
    expect(loc.searchParams.get("scope")).toBe("read:user");
    const state = loc.searchParams.get("state")!;
    expect(state.length).toBeGreaterThanOrEqual(32);
    expect(cookieValue(res, STATE_COOKIE)).toBe(state);
    expect(res.headers.get("location")).not.toContain(SECRET);

    const stateCookie = setCookies(res).find((c) => c.startsWith(STATE_COOKIE))!;
    expect(stateCookie).toMatch(/HttpOnly/i);
    expect(stateCookie).toMatch(/SameSite=lax/i);
    expect(stateCookie).toContain("Path=/auth/github");
    expect(stateCookie).toMatch(/Max-Age=600/);
  });

  it("호출할 때마다 다른 state", async () => {
    const a = cookieValue(await start.GET(new Request(`${BASE}/auth/github`)), STATE_COOKIE);
    const b = cookieValue(await start.GET(new Request(`${BASE}/auth/github`)), STATE_COOKIE);
    expect(a).not.toBe(b);
  });

  it("환경 변수가 없으면 GitHub 로 보내지 않고 /login?error=config, state 쿠키도 만들지 않는다", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "");
    const res = await start.GET(new Request(`${BASE}/auth/github`));
    expect(new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search).toBe("/login?error=config");
    expect(cookieValue(res, STATE_COOKIE)).toBeUndefined();
  });
});

describe("GET /auth/github/callback — 실패 경로 (세션·사용자가 만들어지지 않는다)", () => {
  const expectFailed = (res: Response, code: string) => {
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname + loc.search).toBe(`/login?error=${code}`);
    expect(cookieValue(res, SESSION_COOKIE)).toBeUndefined();
    expect(db.sessions.docs).toHaveLength(0);
    expect(db.users.docs).toHaveLength(0);
    // state 쿠키는 한 번 쓰고 만료시킨다
    expect(setCookies(res).find((c) => c.startsWith(`${STATE_COOKIE}=`))).toContain("Max-Age=0");
  };

  it("state 불일치 → error=state, GitHub 를 호출하지 않는다", async () => {
    const f = mockGithub();
    expectFailed(await callback.GET(callbackReq("code=abc&state=attacker", `${STATE_COOKIE}=real`)), "state");
    expect(f).not.toHaveBeenCalled();
  });

  it("state 쿠키가 없거나 code·state 쿼리가 없어도 error=state", async () => {
    const f = mockGithub();
    expectFailed(await callback.GET(callbackReq("code=abc&state=s")), "state");
    expectFailed(await callback.GET(callbackReq("state=s", `${STATE_COOKIE}=s`)), "state");
    expectFailed(await callback.GET(callbackReq("code=abc", `${STATE_COOKIE}=s`)), "state");
    expect(f).not.toHaveBeenCalled();
  });

  it("사용자가 GitHub 에서 취소하면 error=denied", async () => {
    expectFailed(await callback.GET(callbackReq("error=access_denied&state=s", `${STATE_COOKIE}=s`)), "denied");
  });

  it("환경 변수가 없으면 error=config", async () => {
    vi.stubEnv("GITHUB_CLIENT_SECRET", "");
    expectFailed(await callback.GET(callbackReq("code=abc&state=s", `${STATE_COOKIE}=s`)), "config");
  });

  it("토큰 교환 실패(200 + error) → error=github, 프로필은 조회하지 않는다", async () => {
    const f = mockGithub({ token: { error: "bad_verification_code" } });
    expectFailed(await callback.GET(callbackReq("code=abc&state=s", `${STATE_COOKIE}=s`)), "github");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("토큰 교환 HTTP 오류 → error=github", async () => {
    mockGithub({ tokenStatus: 502 });
    expectFailed(await callback.GET(callbackReq("code=abc&state=s", `${STATE_COOKIE}=s`)), "github");
  });

  it("프로필 형식 오류(id 문자열 / avatar 가 http) → error=github", async () => {
    mockGithub({ profile: { ...ghUser, id: "583231" } });
    expectFailed(await callback.GET(callbackReq("code=abc&state=s", `${STATE_COOKIE}=s`)), "github");
    mockGithub({ profile: { ...ghUser, avatar_url: "http://insecure.test/a.png" } });
    expectFailed(await callback.GET(callbackReq("code=abc&state=s", `${STATE_COOKIE}=s`)), "github");
  });

  it("프로필 HTTP 오류, 네트워크 예외 → error=github", async () => {
    mockGithub({ profileStatus: 401 });
    expectFailed(await callback.GET(callbackReq("code=abc&state=s", `${STATE_COOKIE}=s`)), "github");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    expectFailed(await callback.GET(callbackReq("code=abc&state=s", `${STATE_COOKIE}=s`)), "github");
  });

  it("실패 로그와 리다이렉트 어디에도 client secret 이 나오지 않는다", async () => {
    mockGithub({ token: { error: "incorrect_client_credentials" } });
    const res = await callback.GET(callbackReq("code=abc&state=s", `${STATE_COOKIE}=s`));
    expect(res.headers.get("location")).not.toContain(SECRET);
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain(SECRET);
  });
});

describe("GET /auth/github/callback — 성공 경로", () => {
  async function login(cookie = `${STATE_COOKIE}=s`) {
    return callback.GET(callbackReq("code=the-code&state=s", cookie));
  }

  it("사용자를 upsert 하고(username·avatar_url 저장) 세션 쿠키를 심고 / 로 리다이렉트한다", async () => {
    const f = mockGithub();
    const res = await login();

    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
    expect(db.users.docs).toHaveLength(1);
    expect(db.users.docs[0]).toMatchObject({ github_id: 583231, username: "octocat", avatar_url: ghUser.avatar_url });

    const sid = cookieValue(res, SESSION_COOKIE)!;
    expect(sid).toBeTruthy();
    const sessionCookie = setCookies(res).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=lax/i);

    // DB 에는 해시만, 그 토큰으로 방금 사용자가 조회된다
    expect(db.sessions.docs).toHaveLength(1);
    expect(db.sessions.docs[0].token_hash).toBe(hashToken(sid));
    expect((await findUserByToken(sid))?.username).toBe("octocat");

    // GitHub 로는 설정된 비밀이 본문으로만 나가고, 프로필 조회에는 받은 토큰이 쓰인다
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(JSON.parse(calls[0][1].body as string)).toMatchObject({ client_id: "client-id-123", client_secret: SECRET, code: "the-code" });
    expect((calls[1][1].headers as Record<string, string>).Authorization).toBe("Bearer gho_token");
    // state 쿠키는 소멸
    expect(setCookies(res).find((c) => c.startsWith(`${STATE_COOKIE}=`))).toContain("Max-Age=0");
  });

  it("같은 계정으로 다시 로그인하면 사용자는 하나, GitHub 쪽 username 변경이 반영된다", async () => {
    mockGithub();
    await login();
    mockGithub({ profile: { ...ghUser, login: "octocat-renamed" } });
    await login();
    expect(db.users.docs).toHaveLength(1);
    expect(db.users.docs[0].username).toBe("octocat-renamed");
  });

  it("이미 로그인한 브라우저의 이전 세션은 폐기된다(세션 고정 방지)", async () => {
    const user = await upsertGithubUser({ github_id: 583231, username: "octocat", avatar_url: ghUser.avatar_url });
    const old = await createSession(user._id);
    mockGithub();
    const res = await login(`${STATE_COOKIE}=s; ${SESSION_COOKIE}=${old.token}`);
    const fresh = cookieValue(res, SESSION_COOKIE)!;
    expect(fresh).not.toBe(old.token);
    expect(await findUserByToken(old.token)).toBeNull();
    expect(await findUserByToken(fresh)).not.toBeNull();
    expect(db.sessions.docs).toHaveLength(1);
  });

  it("APP_URL 이 있으면 리다이렉트 기준 주소로 쓴다", async () => {
    vi.stubEnv("APP_URL", "https://todo.example.com");
    mockGithub();
    const res = await login();
    expect(res.headers.get("location")).toBe("https://todo.example.com/");
  });
});
