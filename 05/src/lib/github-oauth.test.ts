import { describe, expect, it, vi } from "vitest";
import {
  appBase,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGithubProfile,
  getOAuthConfig,
  isLoginErrorCode,
  newState,
  parseGithubUser,
  statesMatch,
} from "./github-oauth";

const config = { clientId: "cid", clientSecret: "csecret", redirectUri: "http://localhost:3000/auth/github/callback" };
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("설정", () => {
  it("환경 변수가 모두 있어야 설정이 만들어지고 redirect_uri 는 기준 주소 + 콜백 경로", () => {
    expect(getOAuthConfig("http://x.test", { GITHUB_CLIENT_ID: "a", GITHUB_CLIENT_SECRET: "b" } as never)).toEqual({
      clientId: "a",
      clientSecret: "b",
      redirectUri: "http://x.test/auth/github/callback",
    });
  });

  it("하나라도 없거나 공백이면 null", () => {
    expect(getOAuthConfig("http://x.test", { GITHUB_CLIENT_ID: "a" } as never)).toBeNull();
    expect(getOAuthConfig("http://x.test", { GITHUB_CLIENT_SECRET: "b" } as never)).toBeNull();
    expect(getOAuthConfig("http://x.test", { GITHUB_CLIENT_ID: " ", GITHUB_CLIENT_SECRET: "b" } as never)).toBeNull();
    expect(getOAuthConfig("http://x.test", {} as never)).toBeNull();
  });

  it("운영(NODE_ENV=production)에서는 APP_URL 이 없으면 설정 없음 — Host 헤더로 주소를 만들지 않는다", () => {
    const base = { GITHUB_CLIENT_ID: "a", GITHUB_CLIENT_SECRET: "b", NODE_ENV: "production" };
    expect(getOAuthConfig("http://evil.test", base as never)).toBeNull();
    expect(getOAuthConfig("http://evil.test", { ...base, APP_URL: " " } as never)).toBeNull();
    expect(getOAuthConfig("https://x.test", { ...base, APP_URL: "https://x.test" } as never)).not.toBeNull();
    expect(getOAuthConfig("http://localhost:3000", { ...base, NODE_ENV: "development" } as never)).not.toBeNull();
  });

  it("appBase: APP_URL 이 있으면 origin 만 쓰고, 없거나 잘못되면 요청 origin", () => {
    const req = new Request("http://localhost:3001/auth/github");
    expect(appBase(req, { APP_URL: "https://todo.example.com/" } as never)).toBe("https://todo.example.com");
    expect(appBase(req, {} as never)).toBe("http://localhost:3001");
    expect(appBase(req, { APP_URL: "not a url" } as never)).toBe("http://localhost:3001");
  });
});

describe("state", () => {
  it("매번 다르고 충분히 길다", () => {
    const a = newState();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(newState()).not.toBe(a);
  });

  it("statesMatch: 같을 때만 true, 길이가 달라도 예외 없이 false", () => {
    expect(statesMatch("abc", "abc")).toBe(true);
    expect(statesMatch("abc", "abd")).toBe(false);
    expect(statesMatch("abc", "abcd")).toBe(false);
    expect(statesMatch("", "a")).toBe(false);
  });
});

describe("buildAuthorizeUrl", () => {
  it("client_id·redirect_uri·state·scope 를 담고 client_secret 은 담지 않는다", () => {
    const u = new URL(buildAuthorizeUrl(config, "st"));
    expect(u.origin + u.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("scope")).toBe("read:user");
    expect(u.toString()).not.toContain("csecret");
  });
});

describe("exchangeCodeForToken", () => {
  it("성공하면 access_token 을 돌려주고 올바른 본문으로 POST 한다", async () => {
    const f = vi.fn(async () => jsonRes({ access_token: "gho_abc", token_type: "bearer" }));
    expect(await exchangeCodeForToken(config, "the-code", f as never)).toBe("gho_abc");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://github.com/login/oauth/access_token");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ client_id: "cid", client_secret: "csecret", code: "the-code", redirect_uri: config.redirectUri });
  });

  it("GitHub 가 200 + { error } 로 답해도 실패로 처리하고 오류에 비밀이 없다", async () => {
    const f = async () => jsonRes({ error: "bad_verification_code" });
    const err = await exchangeCodeForToken(config, "c", f as never).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("bad_verification_code");
    expect((err as Error).message).not.toContain("csecret");
  });

  it("HTTP 오류·JSON 아님·access_token 누락은 모두 실패", async () => {
    await expect(exchangeCodeForToken(config, "c", (async () => jsonRes({}, 500)) as never)).rejects.toThrow("HTTP 500");
    await expect(exchangeCodeForToken(config, "c", (async () => new Response("<html>", { status: 200 })) as never)).rejects.toThrow();
    await expect(exchangeCodeForToken(config, "c", (async () => jsonRes({ access_token: "" })) as never)).rejects.toThrow();
    await expect(exchangeCodeForToken(config, "c", (async () => jsonRes({ access_token: 5 })) as never)).rejects.toThrow();
  });
});

describe("parseGithubUser / fetchGithubProfile", () => {
  const ok = { id: 583231, login: "octocat", avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4", name: "ignored" };

  it("정상 응답에서 필요한 세 필드만 꺼낸다", () => {
    expect(parseGithubUser(ok)).toEqual({ github_id: 583231, username: "octocat", avatar_url: ok.avatar_url });
  });

  it.each([
    ["null", null],
    ["id 가 문자열", { ...ok, id: "1" }],
    ["id 가 0 이하", { ...ok, id: 0 }],
    ["id 가 소수", { ...ok, id: 1.5 }],
    ["login 없음", { ...ok, login: "" }],
    ["login 이 너무 김", { ...ok, login: "a".repeat(101) }],
    ["avatar_url 없음", { id: 1, login: "a" }],
    ["avatar_url 이 http", { ...ok, avatar_url: "http://x.test/a.png" }],
    ["avatar_url 이 javascript:", { ...ok, avatar_url: "javascript:alert(1)" }],
    ["avatar_url 이 URL 아님", { ...ok, avatar_url: "nope" }],
  ])("형식 오류는 null: %s", (_n, v) => expect(parseGithubUser(v)).toBeNull());

  it("fetchGithubProfile: Bearer 토큰과 User-Agent 를 보내고 성공 시 프로필을 돌려준다", async () => {
    const f = vi.fn(async () => jsonRes(ok));
    expect((await fetchGithubProfile("gho_abc", f as never)).username).toBe("octocat");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/user");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gho_abc");
    expect((init.headers as Record<string, string>)["User-Agent"]).toBeTruthy();
  });

  it("fetchGithubProfile: HTTP 오류·형식 오류는 실패", async () => {
    await expect(fetchGithubProfile("t", (async () => jsonRes({}, 401)) as never)).rejects.toThrow("HTTP 401");
    await expect(fetchGithubProfile("t", (async () => jsonRes({ id: "x" })) as never)).rejects.toThrow("형식");
  });
});

describe("isLoginErrorCode", () => {
  it("정의된 코드만 true (프로토타입 키·임의 문자열은 false)", () => {
    expect(isLoginErrorCode("state")).toBe(true);
    expect(isLoginErrorCode("toString")).toBe(false);
    expect(isLoginErrorCode("<script>")).toBe(false);
    expect(isLoginErrorCode(undefined)).toBe(false);
  });
});
