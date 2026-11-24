// 대시보드용 순수 집계 함수. mongodb 를 import 하지 않아 클라이언트에서 쓸 수 있다.
import { STATUSES, type Status, type TaskDTO, type WeeklyPlanDTO, type YearGoalDTO } from "./types";
import { isWithin } from "./week";

export type DaySummary = { counts: Record<Status, number>; total: number; progress: number };

/** 하루치 할 일의 상태별 개수와 완료율(done ÷ 전체, 정수 반올림). 할 일이 없으면 0. */
export function summarizeTasks(tasks: ReadonlyArray<Pick<TaskDTO, "status">>): DaySummary {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const t of tasks) counts[t.status] += 1;
  const total = tasks.length;
  return { counts, total, progress: total === 0 ? 0 : Math.round((counts.done / total) * 100) };
}

/** 오늘이 기간에 속하는 주간 계획 */
export function currentPlans(plans: ReadonlyArray<WeeklyPlanDTO>, today: string): WeeklyPlanDTO[] {
  return plans.filter((p) => isWithin(today, p.week_start, p.week_end));
}

/** 해당 연도의 1년 목표 */
export function goalsOfYear(goals: ReadonlyArray<YearGoalDTO>, year: number): YearGoalDTO[] {
  return goals.filter((g) => g.year === year);
}

/** 진행률 평균(정수 반올림). 비어 있으면 0. */
export function averageProgress(items: ReadonlyArray<{ progress: number }>): number {
  return items.length === 0 ? 0 : Math.round(items.reduce((s, i) => s + i.progress, 0) / items.length);
}
