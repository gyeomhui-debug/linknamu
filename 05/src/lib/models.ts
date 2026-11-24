import { ObjectId } from "mongodb";

import { STATUSES, type Status, type TaskDTO, type WeeklyPlanDTO, type YearGoalDTO } from "./types";

export { STATUSES };
export type { Status, TaskDTO, WeeklyPlanDTO, YearGoalDTO };

/** GitHub 계정으로 로그인한 사용자. github_id 가 유니크 키. */
export type User = {
  _id: ObjectId;
  github_id: number;
  username: string;
  avatar_url: string;
  created_at: Date;
  updated_at: Date;
};

/** 서버 저장 세션. 토큰 원문은 저장하지 않고 SHA-256 해시만 둔다. */
export type Session = {
  _id: ObjectId;
  token_hash: string;
  user_id: ObjectId;
  created_at: Date;
  expires_at: Date;
};

export type YearGoal = {
  _id: ObjectId;
  user_id: ObjectId; // 소유자
  year: number;
  title: string;
};

export type WeeklyPlan = {
  _id: ObjectId;
  user_id: ObjectId; // 소유자
  year_goal_id: ObjectId | null;
  week_start: string; // YYYY-MM-DD
  week_end: string; // YYYY-MM-DD
  title: string;
  progress: number; // 0-100 정수
  retrospective?: string; // 주간 회고 메모. 이 필드 도입 전 문서에는 없다.
};

export type Task = {
  _id: ObjectId;
  user_id: ObjectId; // 소유자. 이 필드 도입 전 문서에는 없고 scripts/migrate-user-id.mjs 로 채운다.
  weekly_plan_id: ObjectId | null;
  date: string; // YYYY-MM-DD
  title: string;
  status: Status;
  order: number;
  updated_at: Date; // 어떤 필드든 바뀌면 갱신
  status_changed_at?: Date; // status가 실제로 바뀔 때만 갱신. 이 필드 도입 전 문서에는 없다.
};

// DTO(직렬화 형태: ObjectId → string)는 ./types 에 있다.

export const toYearGoalDTO = (d: YearGoal, progress = 0): YearGoalDTO => ({
  id: d._id.toHexString(),
  year: d.year,
  title: d.title,
  progress,
});

export const toWeeklyPlanDTO = (d: WeeklyPlan): WeeklyPlanDTO => ({
  id: d._id.toHexString(),
  year_goal_id: d.year_goal_id?.toHexString() ?? null,
  week_start: d.week_start,
  week_end: d.week_end,
  title: d.title,
  progress: d.progress,
  retrospective: d.retrospective ?? "",
});

export const toTaskDTO = (d: Task): TaskDTO => ({
  id: d._id.toHexString(),
  weekly_plan_id: d.weekly_plan_id?.toHexString() ?? null,
  date: d.date,
  title: d.title,
  status: d.status,
  order: d.order,
  updated_at: d.updated_at.toISOString(),
  // 기존 문서에는 필드가 없으므로 updated_at으로 대체
  status_changed_at: (d.status_changed_at ?? d.updated_at).toISOString(),
});

export function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

/** 24자리 hex 문자열만 ObjectId로 변환. 아니면 null. */
export function parseId(v: unknown): ObjectId | null {
  return typeof v === "string" && /^[0-9a-f]{24}$/i.test(v) ? new ObjectId(v) : null;
}
