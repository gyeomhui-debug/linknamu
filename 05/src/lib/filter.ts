// 일일 보드 상태 필터. 클라이언트·서버 공용(mongodb 미포함).
import { STATUSES, type Status } from "./types";

export type StatusFilter = "all" | Status;

export const FILTERS: readonly StatusFilter[] = ["all", ...STATUSES];

/** ?status= 값을 필터로 변환. 허용되지 않은 값·없음·배열 등은 모두 "all". */
export function parseStatusFilter(v: unknown): StatusFilter {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v) ? (v as Status) : "all";
}

/** 보드 URL. 기본값(all)은 쿼리에서 생략해 주소를 짧게 유지한다. date 가 없으면(오늘) 날짜도 생략. */
export function boardHref(date: string | undefined, filter: StatusFilter): string {
  const q = new URLSearchParams();
  if (date) q.set("date", date);
  if (filter !== "all") q.set("status", filter);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}
