import { NextResponse } from "next/server";

export const badRequest = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });

export const notFound = (message = "대상을 찾을 수 없습니다.") =>
  NextResponse.json({ error: message }, { status: 404 });

export function serverError(e: unknown, message: string) {
  console.error(e);
  return NextResponse.json({ error: message }, { status: 500 });
}

/** JSON 본문을 객체로 파싱. 실패하거나 객체가 아니면 null. */
export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

export function cleanTitle(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.length <= 200 ? t : null;
}
