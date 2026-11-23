// 미완료 할 일 이월 규칙. 클라이언트·서버 공용(mongodb 미포함).
import type { Status } from "./types";
import { addDays } from "./week";

export type CarryUnit = "day" | "week";

export const CARRY_LABEL: Record<CarryUnit, string> = { day: "내일로", week: "다음 주로" };

/** 이월 대상 날짜: 다음 날(+1일) 또는 다음 주 같은 요일(+7일). */
export function carryOverDate(date: string, unit: CarryUnit): string {
  return addDays(date, unit === "day" ? 1 : 7);
}

/** 마감되지 않은(todo/doing) 할 일만 이월할 수 있다. */
export function canCarryOver(status: Status): boolean {
  return status !== "done";
}
