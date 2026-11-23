import { describe, expect, it } from "vitest";
import { between, needsRenumber } from "./order";
import { canCarryOver, carryOverDate } from "./carryover";
import { boardHref, parseStatusFilter } from "./filter";
import { calcGoalProgress, calcProgress } from "./progress";
import { parseRetrospective, RETRO_MAX } from "./retro";
import { addDays, isValidDate, isWithin, weekRange } from "./week";

describe("calcProgress", () => {
  it("할 일이 없으면 0", () => expect(calcProgress(0, 0)).toBe(0));
  it("1/3 → 33", () => expect(calcProgress(1, 3)).toBe(33));
  it("2/3 → 67", () => expect(calcProgress(2, 3)).toBe(67));
  it("3/3 → 100", () => expect(calcProgress(3, 3)).toBe(100));
});

describe("calcGoalProgress", () => {
  const plans = (...v: number[]) => v.map((progress) => ({ progress }));
  it("연결된 계획이 없으면 0", () => expect(calcGoalProgress([])).toBe(0));
  it("계획 1개면 그 값", () => expect(calcGoalProgress(plans(40))).toBe(40));
  it("여러 계획은 평균", () => expect(calcGoalProgress(plans(0, 100))).toBe(50));
  it("반올림: 33,33,34 → 33", () => expect(calcGoalProgress(plans(33, 33, 34))).toBe(33));
  it("반올림 경계: 0.5 는 올림 (0,1 → 1)", () => expect(calcGoalProgress(plans(0, 1))).toBe(1));
  it("반올림 경계: 67,67,66 → 67", () => expect(calcGoalProgress(plans(67, 67, 66))).toBe(67));
  it("전부 100 이면 100", () => expect(calcGoalProgress(plans(100, 100, 100))).toBe(100));
});

describe("parseRetrospective", () => {
  it("문자열은 앞뒤 공백을 지워 반환", () => expect(parseRetrospective("  이번 주 회고\n다음 주 계획  ")).toBe("이번 주 회고\n다음 주 계획"));
  it("빈 문자열은 메모 삭제로 허용", () => expect(parseRetrospective("")).toBe(""));
  it("공백만 있으면 빈 문자열", () => expect(parseRetrospective("   ")).toBe(""));
  it("문자열이 아니면 null", () => {
    expect(parseRetrospective(null)).toBeNull();
    expect(parseRetrospective(undefined)).toBeNull();
    expect(parseRetrospective(123)).toBeNull();
    expect(parseRetrospective({})).toBeNull();
  });
  it("최대 길이 경계", () => {
    expect(parseRetrospective("a".repeat(RETRO_MAX))).toHaveLength(RETRO_MAX);
    expect(parseRetrospective("a".repeat(RETRO_MAX + 1))).toBeNull();
  });
});

describe("carryover", () => {
  it("다음 날", () => expect(carryOverDate("2026-11-23", "day")).toBe("2026-11-24"));
  it("다음 주(+7일)", () => expect(carryOverDate("2026-11-23", "week")).toBe("2026-11-30"));
  it("월말 경계: 11-30 → 12-01", () => expect(carryOverDate("2026-11-30", "day")).toBe("2026-12-01"));
  it("월말 경계(주): 11-27 → 12-04", () => expect(carryOverDate("2026-11-27", "week")).toBe("2026-12-04"));
  it("연말 경계: 12-31 → 다음 해 01-01", () => expect(carryOverDate("2026-12-31", "day")).toBe("2027-01-01"));
  it("연말 경계(주): 12-28 → 01-04", () => expect(carryOverDate("2026-12-28", "week")).toBe("2027-01-04"));
  it("윤년 2월 말: 2028-02-28 → 02-29, 02-29 → 03-01", () => {
    expect(carryOverDate("2028-02-28", "day")).toBe("2028-02-29");
    expect(carryOverDate("2028-02-29", "day")).toBe("2028-03-01");
  });
  it("평년 2월 말: 2027-02-28 → 03-01", () => expect(carryOverDate("2027-02-28", "day")).toBe("2027-03-01"));
  it("done 은 이월 불가, todo/doing 은 가능", () => {
    expect(canCarryOver("done")).toBe(false);
    expect(canCarryOver("todo")).toBe(true);
    expect(canCarryOver("doing")).toBe(true);
  });
});

describe("parseStatusFilter / boardHref", () => {
  it("유효한 상태값", () => {
    expect(parseStatusFilter("todo")).toBe("todo");
    expect(parseStatusFilter("doing")).toBe("doing");
    expect(parseStatusFilter("done")).toBe("done");
  });
  it("값 없음·'all' 은 all", () => {
    expect(parseStatusFilter(undefined)).toBe("all");
    expect(parseStatusFilter("all")).toBe("all");
  });
  it("잘못된 값은 all", () => {
    expect(parseStatusFilter("DONE")).toBe("all");
    expect(parseStatusFilter("finished")).toBe("all");
    expect(parseStatusFilter("")).toBe("all");
    expect(parseStatusFilter(["done"])).toBe("all");
    expect(parseStatusFilter(null)).toBe("all");
    expect(parseStatusFilter("__proto__")).toBe("all");
  });
  it("보드 URL: 기본값은 생략, 날짜·필터 조합", () => {
    expect(boardHref(undefined, "all")).toBe("/");
    expect(boardHref("2026-11-23", "all")).toBe("/?date=2026-11-23");
    expect(boardHref(undefined, "doing")).toBe("/?status=doing");
    expect(boardHref("2026-11-23", "done")).toBe("/?date=2026-11-23&status=done");
  });
});

describe("between", () => {
  it("빈 컬럼", () => expect(between(null, null)).toBe(1));
  it("맨 앞", () => expect(between(null, 5)).toBe(4));
  it("맨 뒤", () => expect(between(5, null)).toBe(6));
  it("중간", () => expect(between(1, 2)).toBe(1.5));
  it("간격이 너무 좁으면 재번호 필요", () => {
    expect(needsRenumber(1, 1 + 1e-9)).toBe(true);
    expect(needsRenumber(1, 2)).toBe(false);
    expect(needsRenumber(null, 2)).toBe(false);
  });
});

describe("week", () => {
  it("수요일 → 월~일", () =>
    expect(weekRange("2026-11-25")).toEqual({ week_start: "2026-11-23", week_end: "2026-11-29" }));
  it("일요일은 직전 월요일 주", () =>
    expect(weekRange("2026-11-29")).toEqual({ week_start: "2026-11-23", week_end: "2026-11-29" }));
  it("월요일은 그대로 시작일", () => expect(weekRange("2026-11-23").week_start).toBe("2026-11-23"));
  it("기간 포함 여부(양 끝 포함)", () => {
    expect(isWithin("2026-11-23", "2026-11-23", "2026-11-29")).toBe(true);
    expect(isWithin("2026-11-29", "2026-11-23", "2026-11-29")).toBe(true);
    expect(isWithin("2026-11-22", "2026-11-23", "2026-11-29")).toBe(false);
    expect(isWithin("2026-11-30", "2026-11-23", "2026-11-29")).toBe(false);
  });
  it("월 경계 계산", () => expect(addDays("2026-11-30", 1)).toBe("2026-12-01"));
  it("날짜 검증", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-2-3")).toBe(false);
    expect(isValidDate("2026-11-23")).toBe(true);
    expect(isValidDate(20261123)).toBe(false);
  });
});
