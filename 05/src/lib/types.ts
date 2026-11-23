// 클라이언트·서버 공용 타입. mongodb 를 import 하지 않아 브라우저 번들에 안전하다.
export const STATUSES = ["todo", "doing", "done"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = { todo: "할 일", doing: "진행 중", done: "완료" };

/** progress: 연결된 주간 계획 진행률의 평균(0–100). 서버가 계산해 내려준다. */
export type YearGoalDTO = { id: string; year: number; title: string; progress: number };
export type WeeklyPlanDTO = {
  id: string;
  year_goal_id: string | null;
  week_start: string;
  week_end: string;
  title: string;
  progress: number;
  /** 주간 회고 메모 (없으면 빈 문자열) */
  retrospective: string;
};
export type TaskDTO = {
  id: string;
  weekly_plan_id: string | null;
  date: string;
  title: string;
  status: Status;
  order: number;
  updated_at: string;
  status_changed_at: string;
};
