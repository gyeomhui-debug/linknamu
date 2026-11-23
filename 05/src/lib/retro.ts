// 주간 회고 메모 검증. 클라이언트·서버 공용(mongodb 미포함).
export const RETRO_MAX = 2000;

/** 문자열이면 앞뒤 공백을 지운 값을 반환(빈 문자열은 "메모 삭제"로 허용). 문자열이 아니거나 RETRO_MAX 초과면 null. */
export function parseRetrospective(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length <= RETRO_MAX ? t : null;
}
