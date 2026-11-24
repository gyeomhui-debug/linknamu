// 서버 컴포넌트용 현재 사용자 조회. (API 라우트는 auth.ts 의 requireUser 를 쓴다)
import { cookies } from "next/headers";
import { SESSION_COOKIE, findUserByToken } from "./auth";
import type { User } from "./models";

/** 로그인하지 않았거나 DB 를 읽지 못하면 null — 화면은 비로그인 상태로 그려지고 API 가 최종 판단한다. */
export async function getCurrentUser(): Promise<User | null> {
  // cookies() 는 try 밖에서 호출한다: 정적 렌더링 중에는 Next 가 "동적 사용" 신호를 던지는데,
  // 이를 삼키면 라우트가 정적으로 굳어 로그아웃 상태의 헤더가 모두에게 캐시될 수 있다.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  try {
    return await findUserByToken(token);
  } catch (e) {
    console.error("현재 사용자 조회 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}
