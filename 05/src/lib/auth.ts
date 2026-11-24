// 서버 전용: 세션·사용자 저장소와 요청 인증. 클라이언트 컴포넌트에서 import 하지 않는다.
// 세션은 서버에 저장한다(토큰 해시 + 만료). 로그아웃하면 DB 문서를 지워 "완전 삭제"가 된다.
import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import type { User } from "./models";
import { getCollections } from "./mongodb";

export const SESSION_COOKIE = "sid";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7일

function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** DB 에는 토큰 원문 대신 이 해시만 저장한다. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(isProd: boolean = process.env.NODE_ENV === "production") {
  return { httpOnly: true, sameSite: "lax" as const, secure: isProd, path: "/", maxAge: SESSION_TTL_SECONDS };
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** Cookie 헤더에서 이름이 일치하는 값 하나를 꺼낸다. */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

export function sessionTokenFromRequest(request: Request): string | null {
  return readCookie(request.headers.get("cookie"), SESSION_COOKIE);
}

export function setSessionCookie<T extends NextResponse>(res: T, token: string): T {
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

/** 브라우저의 세션 쿠키를 즉시 만료시킨다. */
export function clearSessionCookie<T extends NextResponse>(res: T): T {
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}

/** 멱등. 로그인할 때만 호출해 매 요청의 비용을 늘리지 않는다. */
export async function ensureAuthIndexes(): Promise<void> {
  const { users, sessions } = await getCollections();
  await Promise.all([
    users.createIndex({ github_id: 1 }, { unique: true }),
    sessions.createIndex({ token_hash: 1 }, { unique: true }),
    // 만료된 세션 문서를 Mongo 가 알아서 지운다(만료 판정 자체는 findUserByToken 이 직접 한다)
    sessions.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

export type GithubProfile = { github_id: number; username: string; avatar_url: string };

/** 같은 github_id 면 문서를 늘리지 않고 username·avatar_url 만 갱신한다. */
export async function upsertGithubUser(profile: GithubProfile, now: Date = new Date()): Promise<User> {
  await ensureAuthIndexes();
  const { users } = await getCollections();
  const user = await users.findOneAndUpdate(
    { github_id: profile.github_id },
    {
      $set: { username: profile.username, avatar_url: profile.avatar_url, updated_at: now },
      $setOnInsert: { _id: new ObjectId(), created_at: now },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!user) throw new Error("사용자를 저장하지 못했습니다.");
  return user;
}

export async function createSession(
  userId: ObjectId,
  now: Date = new Date(),
): Promise<{ token: string; expires: Date }> {
  await ensureAuthIndexes();
  const { sessions } = await getCollections();
  const token = newSessionToken();
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  await sessions.insertOne({
    _id: new ObjectId(),
    token_hash: hashToken(token),
    user_id: userId,
    created_at: now,
    expires_at: expires,
  });
  return { token, expires };
}

/** 유효한 세션의 사용자만 돌려준다. 없음·해시 불일치·만료는 모두 null (만료 문서는 지운다). */
export async function findUserByToken(token: string | null | undefined, now: Date = new Date()): Promise<User | null> {
  if (!token) return null;
  const { sessions, users } = await getCollections();
  const session = await sessions.findOne({ token_hash: hashToken(token) });
  if (!session) return null;
  if (isExpired(session.expires_at, now)) {
    await sessions.deleteOne({ _id: session._id });
    return null;
  }
  return users.findOne({ _id: session.user_id });
}

/** 세션 문서를 삭제한다. 이미 없어도 오류가 아니다. */
export async function destroySession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  const { sessions } = await getCollections();
  await sessions.deleteOne({ token_hash: hashToken(token) });
}

type AuthResult = { ok: true; user: User } | { ok: false; response: NextResponse };

/** API 라우트용. 로그인하지 않았으면 401 응답을 돌려준다. 실제 인가는 항상 여기서 한다. */
export async function requireUser(request: Request): Promise<AuthResult> {
  let user: User | null;
  try {
    user = await findUserByToken(sessionTokenFromRequest(request));
  } catch (e) {
    console.error(e);
    return { ok: false, response: NextResponse.json({ error: "인증 상태를 확인하지 못했습니다." }, { status: 500 }) };
  }
  if (!user) return { ok: false, response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  return { ok: true, user };
}
