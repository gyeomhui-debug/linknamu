// 라우트 핸들러를 직접 호출해 소유자 분리(로그인·user_id)를 검증한다. DB 는 인메모리 가짜.
import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeCollections } from "./test-utils/fake-db";

let db: FakeCollections;
vi.mock("@/lib/mongodb", () => ({ getCollections: async () => db }));

import * as plansId from "@/app/api/weekly-plans/[id]/route";
import * as plans from "@/app/api/weekly-plans/route";
import * as goalsId from "@/app/api/year-goals/[id]/route";
import * as goals from "@/app/api/year-goals/route";
import * as tasksId from "@/app/api/tasks/[id]/route";
import * as tasks from "@/app/api/tasks/route";
import { SESSION_COOKIE, createSession, upsertGithubUser } from "./auth";

function req(method: string, path: string, cookie?: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const byId = (c: { docs: Record<string, unknown>[] }, id: string) => c.docs.find((d) => (d._id as ObjectId).toHexString() === id);

async function login(github_id: number, username: string) {
  const user = await upsertGithubUser({ github_id, username, avatar_url: `https://a.example/${github_id}.png` });
  const { token } = await createSession(user._id);
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}

type Who = Awaited<ReturnType<typeof login>>;
type World = { A: Who; B: Who; goalA: string; planA: string; taskA: string; goalB: string; planB: string; taskB: string };

const DATE = "2026-11-24"; // 주 2026-11-23 ~ 2026-11-29 (월~일) 안

async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** 각 사용자가 API 로 목표·계획·할 일을 하나씩 만든다(생성 경로 자체도 검증 대상). */
async function seed(): Promise<World> {
  const A = await login(1, "alice");
  const B = await login(2, "bob");
  const make = async (w: Who, tag: string) => {
    const goal = await json<{ id: string }>(await goals.POST(req("POST", "/api/year-goals", w.cookie, { year: 2026, title: `${tag}-goal` })));
    const plan = await json<{ id: string }>(
      await plans.POST(req("POST", "/api/weekly-plans", w.cookie, { title: `${tag}-plan`, week_start: "2026-11-23", year_goal_id: goal.id })),
    );
    const task = await json<{ id: string }>(
      await tasks.POST(req("POST", "/api/tasks", w.cookie, { title: `${tag}-task`, date: DATE, weekly_plan_id: plan.id })),
    );
    return { goal: goal.id, plan: plan.id, task: task.id };
  };
  const a = await make(A, "A");
  const b = await make(B, "B");
  return { A, B, goalA: a.goal, planA: a.plan, taskA: a.task, goalB: b.goal, planB: b.plan, taskB: b.task };
}

let w: World;
beforeEach(async () => {
  db = createFakeDb();
  w = await seed();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("로그인하지 않은 요청은 모든 핸들러에서 401", () => {
  const cases: [string, (id: string) => Promise<Response>][] = [
    ["GET /api/tasks", () => tasks.GET(req("GET", `/api/tasks?date=${DATE}`))],
    ["POST /api/tasks", () => tasks.POST(req("POST", "/api/tasks", undefined, { title: "x", date: DATE }))],
    ["PATCH /api/tasks/[id]", (id) => tasksId.PATCH(req("PATCH", `/api/tasks/${id}`, undefined, { title: "x" }), ctx(id))],
    ["DELETE /api/tasks/[id]", (id) => tasksId.DELETE(req("DELETE", `/api/tasks/${id}`), ctx(id))],
    ["GET /api/weekly-plans", () => plans.GET(req("GET", "/api/weekly-plans"))],
    ["POST /api/weekly-plans", () => plans.POST(req("POST", "/api/weekly-plans", undefined, { title: "x", week_start: "2026-11-23" }))],
    ["PATCH /api/weekly-plans/[id]", (id) => plansId.PATCH(req("PATCH", `/api/weekly-plans/${id}`, undefined, { title: "x" }), ctx(id))],
    ["DELETE /api/weekly-plans/[id]", (id) => plansId.DELETE(req("DELETE", `/api/weekly-plans/${id}`), ctx(id))],
    ["GET /api/year-goals", () => goals.GET(req("GET", "/api/year-goals"))],
    ["POST /api/year-goals", () => goals.POST(req("POST", "/api/year-goals", undefined, { year: 2026, title: "x" }))],
    ["PATCH /api/year-goals/[id]", (id) => goalsId.PATCH(req("PATCH", `/api/year-goals/${id}`, undefined, { title: "x" }), ctx(id))],
    ["DELETE /api/year-goals/[id]", (id) => goalsId.DELETE(req("DELETE", `/api/year-goals/${id}`), ctx(id))],
  ];
  it.each(cases)("%s", async (_name, call) => {
    const res = await call(w.taskA); // 실제 존재하는 ID 여도 401 (존재 여부를 노출하지 않음)
    expect(res.status).toBe(401);
  });

  it("위조된 세션 쿠키도 401", async () => {
    const res = await tasks.GET(req("GET", `/api/tasks?date=${DATE}`, `${SESSION_COOKIE}=forged`));
    expect(res.status).toBe(401);
  });
});

describe("생성된 문서에는 소유자 user_id 가 저장된다", () => {
  it("목표·계획·할 일 모두", () => {
    const owner = (c: { docs: Record<string, unknown>[] }, id: string) =>
      (byId(c, id)?.user_id as ObjectId | undefined)?.toHexString();
    expect(owner(db.yearGoals, w.goalA)).toBe(w.A.user._id.toHexString());
    expect(owner(db.weeklyPlans, w.planA)).toBe(w.A.user._id.toHexString());
    expect(owner(db.tasks, w.taskA)).toBe(w.A.user._id.toHexString());
    expect(owner(db.tasks, w.taskB)).toBe(w.B.user._id.toHexString());
  });
});

describe("조회는 본인 것만", () => {
  it("할 일: 같은 날짜여도 각자 자기 것만", async () => {
    const a = await json<{ id: string }[]>(await tasks.GET(req("GET", `/api/tasks?date=${DATE}`, w.A.cookie)));
    const b = await json<{ id: string }[]>(await tasks.GET(req("GET", `/api/tasks?date=${DATE}`, w.B.cookie)));
    expect(a.map((t) => t.id)).toEqual([w.taskA]);
    expect(b.map((t) => t.id)).toEqual([w.taskB]);
  });

  it("남의 주간 계획 ID 로 할 일을 조회하면 빈 배열", async () => {
    const res = await tasks.GET(req("GET", `/api/tasks?weeklyPlanId=${w.planA}`, w.B.cookie));
    expect(await json(res)).toEqual([]);
  });

  it("주간 계획·1년 목표 목록도 본인 것만", async () => {
    const p = await json<{ id: string }[]>(await plans.GET(req("GET", "/api/weekly-plans", w.B.cookie)));
    const g = await json<{ id: string }[]>(await goals.GET(req("GET", "/api/year-goals", w.B.cookie)));
    expect(p.map((x) => x.id)).toEqual([w.planB]);
    expect(g.map((x) => x.id)).toEqual([w.goalB]);
  });

  it("로그인했어도 date·weeklyPlanId 가 모두 없으면 기존처럼 400", async () => {
    const res = await tasks.GET(req("GET", "/api/tasks", w.A.cookie));
    expect(res.status).toBe(400);
  });
});

describe("남의 리소스 ID 로는 수정·삭제할 수 없다 (404, 데이터 불변)", () => {
  it("할 일 PATCH/DELETE", async () => {
    const patch = await tasksId.PATCH(req("PATCH", `/api/tasks/${w.taskA}`, w.B.cookie, { title: "해킹", status: "done" }), ctx(w.taskA));
    expect(patch.status).toBe(404);
    const del = await tasksId.DELETE(req("DELETE", `/api/tasks/${w.taskA}`, w.B.cookie), ctx(w.taskA));
    expect(del.status).toBe(404);
    const stored = byId(db.tasks, w.taskA)!;
    expect(stored.title).toBe("A-task");
    expect(stored.status).toBe("todo");
  });

  it("주간 계획 PATCH/DELETE — 삭제 시도가 연결된 할 일을 건드리지 않는다", async () => {
    const patch = await plansId.PATCH(req("PATCH", `/api/weekly-plans/${w.planA}`, w.B.cookie, { title: "해킹" }), ctx(w.planA));
    expect(patch.status).toBe(404);
    const del = await plansId.DELETE(req("DELETE", `/api/weekly-plans/${w.planA}`, w.B.cookie), ctx(w.planA));
    expect(del.status).toBe(404);
    const task = byId(db.tasks, w.taskA)!;
    expect((task.weekly_plan_id as ObjectId).toHexString()).toBe(w.planA);
    expect(db.weeklyPlans.docs).toHaveLength(2);
  });

  it("1년 목표 PATCH/DELETE — 삭제 시도가 연결된 계획을 건드리지 않는다", async () => {
    const patch = await goalsId.PATCH(req("PATCH", `/api/year-goals/${w.goalA}`, w.B.cookie, { title: "해킹" }), ctx(w.goalA));
    expect(patch.status).toBe(404);
    const del = await goalsId.DELETE(req("DELETE", `/api/year-goals/${w.goalA}`, w.B.cookie), ctx(w.goalA));
    expect(del.status).toBe(404);
    const plan = byId(db.weeklyPlans, w.planA)!;
    expect((plan.year_goal_id as ObjectId).toHexString()).toBe(w.goalA);
    expect(db.yearGoals.docs).toHaveLength(2);
  });

  it("본인은 정상적으로 수정할 수 있다", async () => {
    const res = await tasksId.PATCH(req("PATCH", `/api/tasks/${w.taskA}`, w.A.cookie, { status: "done" }), ctx(w.taskA));
    expect(res.status).toBe(200);
    expect((await json<{ status: string }>(res)).status).toBe("done");
  });
});

describe("남의 상위 항목에는 연결할 수 없다 (400)", () => {
  it("남의 주간 계획에 할 일 생성", async () => {
    const res = await tasks.POST(req("POST", "/api/tasks", w.B.cookie, { title: "x", date: DATE, weekly_plan_id: w.planA }));
    expect(res.status).toBe(400);
  });

  it("내 할 일을 남의 주간 계획으로 이동", async () => {
    const res = await tasksId.PATCH(req("PATCH", `/api/tasks/${w.taskB}`, w.B.cookie, { weekly_plan_id: w.planA }), ctx(w.taskB));
    expect(res.status).toBe(400);
  });

  it("남의 1년 목표에 주간 계획 생성·연결", async () => {
    const create = await plans.POST(req("POST", "/api/weekly-plans", w.B.cookie, { title: "x", week_start: "2026-11-23", year_goal_id: w.goalA }));
    expect(create.status).toBe(400);
    const link = await plansId.PATCH(req("PATCH", `/api/weekly-plans/${w.planB}`, w.B.cookie, { year_goal_id: w.goalA }), ctx(w.planB));
    expect(link.status).toBe(400);
  });
});

describe("연결 해제·진행률·순서는 소유자 범위 안에서만 동작", () => {
  it("A 가 계획을 지워도 B 의 할 일 연결은 그대로, A 의 할 일만 연결 해제", async () => {
    const res = await plansId.DELETE(req("DELETE", `/api/weekly-plans/${w.planA}`, w.A.cookie), ctx(w.planA));
    expect(res.status).toBe(200);
    const get = (id: string) => byId(db.tasks, id)!;
    expect(get(w.taskA).weekly_plan_id).toBeNull();
    expect((get(w.taskB).weekly_plan_id as ObjectId).toHexString()).toBe(w.planB);
  });

  it("A 가 목표를 지워도 B 의 계획 연결은 그대로", async () => {
    await goalsId.DELETE(req("DELETE", `/api/year-goals/${w.goalA}`, w.A.cookie), ctx(w.goalA));
    const get = (id: string) => byId(db.weeklyPlans, id)!;
    expect(get(w.planA).year_goal_id).toBeNull();
    expect((get(w.planB).year_goal_id as ObjectId).toHexString()).toBe(w.goalB);
  });

  it("A 가 할 일을 완료해도 A 의 계획 진행률만 바뀐다", async () => {
    await tasksId.PATCH(req("PATCH", `/api/tasks/${w.taskA}`, w.A.cookie, { status: "done" }), ctx(w.taskA));
    const progress = (id: string) => byId(db.weeklyPlans, id)!.progress;
    expect(progress(w.planA)).toBe(100);
    expect(progress(w.planB)).toBe(0);
  });

  it("1년 목표 진행률은 본인 계획만 집계한다", async () => {
    await tasksId.PATCH(req("PATCH", `/api/tasks/${w.taskA}`, w.A.cookie, { status: "done" }), ctx(w.taskA));
    const a = await json<{ progress: number }[]>(await goals.GET(req("GET", "/api/year-goals", w.A.cookie)));
    const b = await json<{ progress: number }[]>(await goals.GET(req("GET", "/api/year-goals", w.B.cookie)));
    expect(a[0].progress).toBe(100);
    expect(b[0].progress).toBe(0);
  });

  it("새 할 일의 order 는 같은 날짜의 다른 사용자 카드와 무관하게 매겨진다", async () => {
    // seed 에서 A, B 가 같은 날짜 todo 컬럼에 카드를 하나씩 만들었다 → 둘 다 order 1
    const orderOf = (id: string) => byId(db.tasks, id)!.order;
    expect(orderOf(w.taskA)).toBe(1);
    expect(orderOf(w.taskB)).toBe(1);
    const next = await json<{ order: number }>(await tasks.POST(req("POST", "/api/tasks", w.A.cookie, { title: "A2", date: DATE })));
    expect(next.order).toBe(2);
  });
});

describe("검토 지적 회귀 (소유자 범위 · 계획 간 이동)", () => {
  const progressOf = (id: string) => byId(db.weeklyPlans, id)!.progress;

  it("F1: 위치 키 없이 컬럼만 바꿔도 order 는 다른 사용자의 같은 컬럼 카드와 무관하다", async () => {
    // A 가 done 컬럼에 카드를 먼저 둔다(order 1). B 가 같은 날짜 done 으로 옮기면 B 의 첫 카드라 1 이어야 한다.
    await tasksId.PATCH(req("PATCH", `/api/tasks/${w.taskA}`, w.A.cookie, { status: "done" }), ctx(w.taskA));
    const res = await tasksId.PATCH(req("PATCH", `/api/tasks/${w.taskB}`, w.B.cookie, { status: "done" }), ctx(w.taskB));
    expect((await json<{ order: number }>(res)).order).toBe(1);
  });

  it("F2/F4: 같은 사용자의 계획 A→B 로 옮기면 이전·새 계획 진행률이 모두 갱신된다", async () => {
    const second = await json<{ id: string }>(
      await plans.POST(req("POST", "/api/weekly-plans", w.A.cookie, { title: "A-plan-2", week_start: "2026-11-23" })),
    );
    await tasksId.PATCH(req("PATCH", `/api/tasks/${w.taskA}`, w.A.cookie, { status: "done" }), ctx(w.taskA));
    expect(progressOf(w.planA)).toBe(100);
    expect(progressOf(second.id)).toBe(0);

    const moved = await tasksId.PATCH(req("PATCH", `/api/tasks/${w.taskA}`, w.A.cookie, { weekly_plan_id: second.id }), ctx(w.taskA));
    expect(moved.status).toBe(200);
    expect(progressOf(w.planA)).toBe(0); // 이전 계획은 할 일이 없어져 0%
    expect(progressOf(second.id)).toBe(100); // 새 계획은 done 1/1
    expect(progressOf(w.planB)).toBe(0); // 다른 사용자의 계획은 그대로
  });

  it("F2: 계획 기간을 줄일 때 '기간 밖 할 일' 개수에 다른 사용자의 할 일이 섞이지 않는다", async () => {
    // B 의 할 일이 우연히 같은 날짜여도, A 의 계획 기간 검사는 A 의 할 일만 센다.
    // A 의 계획 기간을 할 일 날짜(11-24)가 포함되도록 줄이면 성공해야 한다.
    const res = await plansId.PATCH(req("PATCH", `/api/weekly-plans/${w.planA}`, w.A.cookie, { week_start: "2026-11-24" }), ctx(w.planA));
    expect(res.status).toBe(200);
    // 날짜를 지나치게 줄이면(할 일이 밖으로 나감) 400 이고 개수는 A 의 것만 센다
    const bad = await plansId.PATCH(req("PATCH", `/api/weekly-plans/${w.planA}`, w.A.cookie, { week_start: "2026-11-25" }), ctx(w.planA));
    expect(bad.status).toBe(400);
    expect((await json<{ error: string }>(bad)).error).toContain("1개");
  });
});

describe("기존 비즈니스 규칙은 로그인 상태에서 그대로", () => {
  it("빈 제목·잘못된 날짜·기간 밖 날짜는 400", async () => {
    expect((await tasks.POST(req("POST", "/api/tasks", w.A.cookie, { title: "  ", date: DATE }))).status).toBe(400);
    expect((await tasks.POST(req("POST", "/api/tasks", w.A.cookie, { title: "x", date: "2026-13-40" }))).status).toBe(400);
    const outside = await tasks.POST(req("POST", "/api/tasks", w.A.cookie, { title: "x", date: "2026-12-30", weekly_plan_id: w.planA }));
    expect(outside.status).toBe(400);
  });

  it("상태 변경 시에만 status_changed_at 이 바뀐다", async () => {
    const get = () => byId(db.tasks, w.taskA)!;
    const before = (get().status_changed_at as Date).getTime();
    await tasksId.PATCH(req("PATCH", `/api/tasks/${w.taskA}`, w.A.cookie, { title: "제목만" }), ctx(w.taskA));
    expect((get().status_changed_at as Date).getTime()).toBe(before);
  });
});
