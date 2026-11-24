import type { ObjectId } from "mongodb";
import { getCollections } from "./mongodb";

/** done ÷ 전체 × 100 (정수 반올림). 전체가 0이면 0. */
export function calcProgress(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** 1년 목표 진행률: 연결된 주간 계획 progress 의 평균(정수 반올림). 연결된 계획이 없으면 0. */
export function calcGoalProgress(plans: ReadonlyArray<{ progress: number }>): number {
  if (plans.length === 0) return 0;
  return Math.round(plans.reduce((sum, p) => sum + p.progress, 0) / plans.length);
}

/** 연결된 주간 계획이 있는 1년 목표별 진행률(goalId hex → 0–100). 연결이 없는 목표는 맵에 없다. 그 사용자의 계획만 집계한다(userId 필수 — 빠뜨리면 컴파일 오류). */
export async function getGoalProgressMap(userId: ObjectId): Promise<Map<string, number>> {
  const { weeklyPlans } = await getCollections();
  const linked = await weeklyPlans.find({ year_goal_id: { $ne: null }, user_id: userId }).toArray();
  const byGoal = new Map<string, { progress: number }[]>();
  for (const p of linked) {
    const key = p.year_goal_id!.toHexString();
    const list = byGoal.get(key);
    if (list) list.push(p);
    else byGoal.set(key, [p]);
  }
  return new Map([...byGoal].map(([key, plans]) => [key, calcGoalProgress(plans)]));
}

/** 주간 계획의 진행률을 DB의 할 일 수로 다시 계산해 저장. 증분이 아닌 전체 재계산이라 어긋나지 않는다. 소유자 범위 안에서만 세고 쓴다. */
export async function recalcWeeklyPlan(planId: ObjectId | null | undefined, userId: ObjectId): Promise<void> {
  if (!planId) return;
  const { tasks, weeklyPlans } = await getCollections();
  const [total, done] = await Promise.all([
    tasks.countDocuments({ weekly_plan_id: planId, user_id: userId }),
    tasks.countDocuments({ weekly_plan_id: planId, user_id: userId, status: "done" }),
  ]);
  await weeklyPlans.updateOne({ _id: planId, user_id: userId }, { $set: { progress: calcProgress(done, total) } });
}
