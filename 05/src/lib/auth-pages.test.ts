// 로그아웃 라우트, proxy(페이지 보호), /login 페이지, 클라이언트 401 처리 테스트.
// Next 내부 모듈이라 공개 타입 선언에는 없다. 필요한 모양만 직접 선언해 쓴다.
import * as pageStaticInfo from "next/dist/build/analysis/get-page-static-info";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeCollections } from "./test-utils/fake-db";

let db: FakeCollections;
let currentUser: unknown = null;
vi.mock("@/lib/mongodb", () => ({ getCollections: async () => db }));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: async () => currentUser }));

import LoginPage from "@/app/login/page";
import * as logout from "@/app/auth/logout/route";
import { config, proxy } from "@/proxy";
import { SESSION_COOKIE, createSession, findUserByToken, upsertGithubUser } from "./auth";
import { api } from "./client";
import { LOGIN_ERRORS } from "./github-oauth";

const BASE = "http://localhost:3000";
const getMiddlewareMatchers = (pageStaticInfo as unknown as {
  getMiddlewareMatchers: (matcher: unknown, config: { basePath: string }) => { regexp: string }[];
}).getMiddlewareMatchers;

beforeEach(() => {
  db = createFakeDb();
  currentUser = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /auth/logout", () => {
  async function loggedIn() {
    const user = await upsertGithubUser({ github_id: 1, username: "octocat", avatar_url: "https://a.example/1.png" });
    const { token } = await createSession(user._id);
    return token;
  }
  const post = (cookie?: string) => new Request(`${BASE}/auth/logout`, { method: "POST", headers: cookie ? { cookie } : {} });

  it("서버의 세션 문서를 삭제하고 쿠키를 만료시킨 뒤 /login 으로 303", async () => {
    const token = await loggedIn();
    expect(db.sessions.docs).toHaveLength(1);

    const res = await logout.POST(post(`${SESSION_COOKIE}=${token}`));

    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    const cleared = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
    expect(cleared).toContain("Max-Age=0");
    expect(cleared).toMatch(/HttpOnly/i);
    expect(db.sessions.docs).toHaveLength(0);
  });

  it("로그아웃 뒤에는 같은 쿠키 값으로 더 이상 인증되지 않는다 (쿠키를 훔쳐 재사용해도 무효)", async () => {
    const token = await loggedIn();
    expect(await findUserByToken(token)).not.toBeNull();
    await logout.POST(post(`${SESSION_COOKIE}=${token}`));
    expect(await findUserByToken(token)).toBeNull();
  });

  it("다른 기기의 세션은 건드리지 않는다", async () => {
    const user = await upsertGithubUser({ github_id: 1, username: "octocat", avatar_url: "https://a.example/1.png" });
    const here = await createSession(user._id);
    const other = await createSession(user._id);
    await logout.POST(post(`${SESSION_COOKIE}=${here.token}`));
    expect(await findUserByToken(other.token)).not.toBeNull();
  });

  it("쿠키가 없어도(이미 로그아웃) 오류 없이 /login 으로 보낸다", async () => {
    const res = await logout.POST(post());
    expect(res.status).toBe(303);
  });

  it("DB 삭제에 실패하면 로그아웃된 척하지 않고 500 (쿠키도 유지)", async () => {
    db = { ...db, sessions: { deleteOne: async () => { throw new Error("db down"); } } as never };
    const res = await logout.POST(post(`${SESSION_COOKIE}=sometoken`));
    expect(res.status).toBe(500);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("POST 만 내보낸다 — GET 은 Next 가 405 로 처리", () => {
    expect((logout as Record<string, unknown>).GET).toBeUndefined();
  });
});

describe("proxy (페이지 보호, 낙관적 검사)", () => {
  const page = (path: string, cookie?: string) => new NextRequest(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });

  it("세션 쿠키가 없으면 /login 으로 리다이렉트", () => {
    for (const path of ["/", "/weeks", "/goals", "/dashboard", "/?date=2026-11-24"]) {
      const res = proxy(page(path));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    }
  });

  it("세션 쿠키가 있으면 통과 (유효성은 API 가 판단)", () => {
    const res = proxy(page("/weeks", `${SESSION_COOKIE}=anything`));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  describe("matcher 는 페이지만 보호하고 로그인 흐름·API·정적 파일은 건드리지 않는다", () => {
    // 일반 정규식으로 흉내 내지 않고, Next 가 빌드할 때 쓰는 컴파일러로 matcher 를 실제로 컴파일한다.
    // (문법 오류나 백슬래시 이스케이프 실수가 있으면 여기서 보호/제외 결과가 달라진다. next 는 16.4.6 으로 고정)
    const [compiled] = getMiddlewareMatchers(config.matcher, { basePath: "" });
    const re = new RegExp(compiled.regexp);
    // /authors·/login-help·/apiary 처럼 접두사만 같은 경로는 제외 대상이 아니다(세그먼트 단위로만 제외)
    it.each(["/", "/weeks", "/goals", "/dashboard", "/authors", "/login-help", "/apiary"])("보호함: %s", (p) => expect(re.test(p)).toBe(true));
    it.each([
      "/login",
      "/login/",
      "/auth/github",
      "/auth/github/callback",
      "/auth/logout",
      "/api/tasks",
      "/api/year-goals/abc",
      "/_next/static/chunks/main.js",
      "/_next/image",
      "/favicon.ico",
      "/logo.png",
    ])("건드리지 않음: %s", (p) => expect(re.test(p)).toBe(false));
  });
});

describe("/login 페이지", () => {
  const render = async (error?: string) => JSON.stringify(await LoginPage({ searchParams: Promise.resolve({ error }) }));

  it("GitHub 로그인 링크(/auth/github)가 있다", async () => {
    expect(await render()).toContain('"href":"/auth/github"');
  });

  it("알려진 error 코드는 고정 문구로 보여 준다", async () => {
    for (const code of ["config", "denied", "state", "github"] as const) {
      expect(await render(code)).toContain(LOGIN_ERRORS[code]);
    }
  });

  it("알 수 없는 error 값은 보여 주지 않는다(임의 문자열 반사 금지)", async () => {
    const out = await render("<script>alert(1)</script>");
    expect(out).not.toContain("script");
    expect(out).not.toContain('"role":"alert"');
    expect(await render("toString")).not.toContain('"role":"alert"');
  });

  it("이미 로그인했다면 / 로 리다이렉트", async () => {
    currentUser = { username: "octocat" };
    const err = await LoginPage({ searchParams: Promise.resolve({}) }).catch((e: { digest?: string }) => e);
    expect(String((err as { digest?: string }).digest)).toContain("NEXT_REDIRECT");
    expect(String((err as { digest?: string }).digest)).toContain(";/;");
  });
});

describe("클라이언트 api() 의 401 처리", () => {
  it("401 이면 /login 으로 이동시키고 서버 메시지로 오류를 던진다", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "로그인이 필요합니다." }), { status: 401 })));
    await expect(api("/api/tasks?date=2026-11-24")).rejects.toThrow("로그인이 필요합니다.");
    expect(assign).toHaveBeenCalledExactlyOnceWith("/login");
  });

  it("401 이 아닌 오류에서는 이동하지 않는다", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "잘못된 요청" }), { status: 400 })));
    await expect(api("/api/tasks")).rejects.toThrow("잘못된 요청");
    expect(assign).not.toHaveBeenCalled();
  });

  it("성공 응답은 그대로 돌려준다", async () => {
    vi.stubGlobal("window", { location: { assign: vi.fn() } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([1, 2]), { status: 200 })));
    expect(await api<number[]>("/api/x")).toEqual([1, 2]);
  });
});
