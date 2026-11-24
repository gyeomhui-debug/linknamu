import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeCollections } from "./test-utils/fake-db";

let db: FakeCollections;
vi.mock("./mongodb", () => ({ getCollections: async () => db }));

import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  clearSessionCookie,
  createSession,
  destroySession,
  findUserByToken,
  hashToken,
  isExpired,
  readCookie,
  requireUser,
  sessionCookieOptions,
  setSessionCookie,
  upsertGithubUser,
} from "./auth";

const profile = { github_id: 1234, username: "octocat", avatar_url: "https://avatars.example/1.png" };
const T0 = new Date("2026-11-24T00:00:00Z");

beforeEach(() => {
  db = createFakeDb();
});

describe("hashToken / 쿠키 옵션", () => {
  it("SHA-256 hex(64자)이며 결정적이고 원문과 다르다", () => {
    const h = hashToken("abc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).toBe(h);
    expect(hashToken("abd")).not.toBe(h);
    expect(h).not.toContain("abc");
  });

  it("운영에서는 secure, 개발에서는 아니며 httpOnly·lax·path=/·maxAge 는 서버 TTL 과 같다", () => {
    expect(sessionCookieOptions(true)).toEqual({ httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: SESSION_TTL_SECONDS });
    expect(sessionCookieOptions(false).secure).toBe(false);
    expect(sessionCookieOptions(false).httpOnly).toBe(true);
  });

  it("setSessionCookie / clearSessionCookie 가 Set-Cookie 헤더에 속성을 싣는다", () => {
    const set = setSessionCookie(NextResponse.json({}), "tok").headers.get("set-cookie") ?? "";
    expect(set).toContain(`${SESSION_COOKIE}=tok`);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=lax/i);
    expect(set).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);

    const cleared = clearSessionCookie(NextResponse.json({})).headers.get("set-cookie") ?? "";
    expect(cleared).toContain(`${SESSION_COOKIE}=;`);
    expect(cleared).toContain("Max-Age=0");
  });

  it("readCookie 는 이름이 정확히 일치하는 값만 꺼낸다", () => {
    expect(readCookie("a=1; sid=xyz; b=2", "sid")).toBe("xyz");
    expect(readCookie("xsid=bad; sid=ok", "sid")).toBe("ok");
    expect(readCookie("a=1", "sid")).toBeNull();
    expect(readCookie("sid=", "sid")).toBeNull();
    expect(readCookie(null, "sid")).toBeNull();
  });

  it("isExpired 경계: 만료 시각과 같으면 만료", () => {
    expect(isExpired(T0, T0)).toBe(true);
    expect(isExpired(new Date(T0.getTime() + 1), T0)).toBe(false);
  });
});

describe("users upsert", () => {
  it("같은 github_id 로 다시 로그인하면 문서가 늘지 않고 username·avatar_url 이 갱신된다", async () => {
    const first = await upsertGithubUser(profile, T0);
    const later = new Date(T0.getTime() + 60_000);
    const again = await upsertGithubUser({ ...profile, username: "renamed", avatar_url: "https://avatars.example/2.png" }, later);

    expect(db.users.docs).toHaveLength(1);
    expect(again._id.equals(first._id)).toBe(true);
    expect(again.username).toBe("renamed");
    expect(again.avatar_url).toBe("https://avatars.example/2.png");
    expect(again.created_at).toEqual(T0);
    expect(again.updated_at).toEqual(later);
  });

  it("다른 github_id 는 다른 사용자다", async () => {
    await upsertGithubUser(profile, T0);
    await upsertGithubUser({ ...profile, github_id: 99 }, T0);
    expect(db.users.docs).toHaveLength(2);
  });

  it("필요한 인덱스를 만든다: github_id 유니크, token_hash 유니크, expires_at TTL", async () => {
    await upsertGithubUser(profile, T0);
    expect(db.users.indexes).toContainEqual({ key: { github_id: 1 }, options: { unique: true } });
    expect(db.sessions.indexes).toContainEqual({ key: { token_hash: 1 }, options: { unique: true } });
    expect(db.sessions.indexes).toContainEqual({ key: { expires_at: 1 }, options: { expireAfterSeconds: 0 } });
  });
});

describe("세션", () => {
  it("DB 에는 토큰 원문이 아니라 해시만 저장되고 만료는 TTL 만큼 뒤다", async () => {
    const user = await upsertGithubUser(profile, T0);
    const { token, expires } = await createSession(user._id, T0);

    expect(db.sessions.docs).toHaveLength(1);
    const stored = db.sessions.docs[0];
    expect(stored.token_hash).toBe(hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect((stored.user_id as ObjectId).equals(user._id)).toBe(true);
    expect(expires.getTime() - T0.getTime()).toBe(SESSION_TTL_SECONDS * 1000);
    expect(stored.expires_at).toEqual(expires);
  });

  it("유효한 토큰은 사용자를 돌려준다", async () => {
    const user = await upsertGithubUser(profile, T0);
    const { token } = await createSession(user._id, T0);
    const found = await findUserByToken(token, new Date(T0.getTime() + 1000));
    expect(found?._id.equals(user._id)).toBe(true);
  });

  it("토큰 없음·해시 불일치는 null", async () => {
    const user = await upsertGithubUser(profile, T0);
    const { token } = await createSession(user._id, T0);
    expect(await findUserByToken(null, T0)).toBeNull();
    expect(await findUserByToken("", T0)).toBeNull();
    expect(await findUserByToken(token + "x", T0)).toBeNull();
  });

  it("만료된 세션은 null 이고 문서가 지워진다", async () => {
    const user = await upsertGithubUser(profile, T0);
    const { token, expires } = await createSession(user._id, T0);
    expect(await findUserByToken(token, expires)).toBeNull();
    expect(db.sessions.docs).toHaveLength(0);
  });

  it("세션은 있지만 사용자가 없으면 null", async () => {
    const { token } = await createSession(new ObjectId(), T0);
    expect(await findUserByToken(token, T0)).toBeNull();
  });

  it("destroySession 뒤에는 같은 토큰이 통하지 않고, 두 번 불러도 오류가 아니다", async () => {
    const user = await upsertGithubUser(profile, T0);
    const { token } = await createSession(user._id, T0);
    await destroySession(token);
    expect(db.sessions.docs).toHaveLength(0);
    expect(await findUserByToken(token, T0)).toBeNull();
    await expect(destroySession(token)).resolves.toBeUndefined();
    await expect(destroySession(null)).resolves.toBeUndefined();
  });

  it("한 사용자의 세션을 지워도 다른 세션은 남는다", async () => {
    const user = await upsertGithubUser(profile, T0);
    const a = await createSession(user._id, T0);
    const b = await createSession(user._id, T0);
    await destroySession(a.token);
    expect(await findUserByToken(a.token, T0)).toBeNull();
    expect(await findUserByToken(b.token, T0)).not.toBeNull();
  });
});

describe("requireUser", () => {
  const req = (cookie?: string) => new Request("http://localhost/api/tasks", { headers: cookie ? { cookie } : {} });

  it("쿠키가 없으면 401 과 한국어 오류", async () => {
    const r = await requireUser(req());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(401);
      expect((await r.response.json()).error).toBe("로그인이 필요합니다.");
    }
  });

  it("가짜 토큰이면 401", async () => {
    const r = await requireUser(req(`${SESSION_COOKIE}=forged`));
    expect(r.ok).toBe(false);
  });

  it("유효한 세션 쿠키면 사용자를 돌려준다", async () => {
    const user = await upsertGithubUser(profile, new Date());
    const { token } = await createSession(user._id, new Date());
    const r = await requireUser(req(`other=1; ${SESSION_COOKIE}=${token}`));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.username).toBe("octocat");
  });

  it("DB 오류는 401 이 아니라 500 이다(인증 실패와 구분)", async () => {
    db = { ...db, sessions: { findOne: async () => { throw new Error("db down"); } } as never };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await requireUser(req(`${SESSION_COOKIE}=x`));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(500);
  });
});
