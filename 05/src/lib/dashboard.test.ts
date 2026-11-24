import { describe, expect, it } from "vitest";
import { averageProgress, currentPlans, goalsOfYear, summarizeTasks } from "./dashboard";
import type { WeeklyPlanDTO, YearGoalDTO } from "./types";

const plan = (week_start: string, week_end: string): WeeklyPlanDTO => ({
  id: week_start,
  year_goal_id: null,
  week_start,
  week_end,
  title: "t",
  progress: 0,
  retrospective: "",
});

describe("dashboard", () => {
  it("summarizeTasks: 상태별 개수와 완료율", () => {
    const s = summarizeTasks([{ status: "done" }, { status: "done" }, { status: "todo" }]);
    expect(s).toEqual({ counts: { todo: 1, doing: 0, done: 2 }, total: 3, progress: 67 });
  });

  it("summarizeTasks: 비어 있으면 0%", () => {
    expect(summarizeTasks([]).progress).toBe(0);
  });

  it("currentPlans: 경계일을 포함해 오늘이 속한 계획만", () => {
    const plans = [plan("2026-11-23", "2026-11-29"), plan("2026-11-30", "2026-12-06")];
    expect(currentPlans(plans, "2026-11-29").map((p) => p.id)).toEqual(["2026-11-23"]);
    expect(currentPlans(plans, "2026-11-30").map((p) => p.id)).toEqual(["2026-11-30"]);
    expect(currentPlans(plans, "2026-12-07")).toEqual([]);
  });

  it("goalsOfYear: 해당 연도만", () => {
    const goals: YearGoalDTO[] = [
      { id: "a", year: 2026, title: "a", progress: 0 },
      { id: "b", year: 2025, title: "b", progress: 0 },
    ];
    expect(goalsOfYear(goals, 2026).map((g) => g.id)).toEqual(["a"]);
  });

  it("averageProgress: 반올림 평균, 빈 배열은 0", () => {
    expect(averageProgress([{ progress: 50 }, { progress: 51 }])).toBe(51);
    expect(averageProgress([])).toBe(0);
  });
});
