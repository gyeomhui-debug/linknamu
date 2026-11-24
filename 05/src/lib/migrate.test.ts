import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS, INDEXES, formatReport, migrate, parseArgs } from "../../scripts/migrate-user-id.mjs";
import { createFakeDb, type FakeCollections } from "./test-utils/fake-db";

let db: FakeCollections;
vi.mock("@/lib/mongodb", () => ({ getCollections: async () => db }));

import * as tasksRoute from "@/app/api/tasks/route";
import { SESSION_COOKIE, createSession, upsertGithubUser } from "./auth";

const adapter = () => ({ collection: (name: string) => db[name as keyof FakeCollections] });
const legacy = (title: string) => ({ _id: new ObjectId(), title, date: "2026-11-24", status: "todo", order: 1, weekly_plan_id: null, updated_at: new Date() });
const hex = (v: unknown) => (v as ObjectId | undefined)?.toHexString();

let alice: ObjectId;
let bob: ObjectId;
beforeEach(async () => {
  db = createFakeDb();
  alice = (await upsertGithubUser({ github_id: 1, username: "alice", avatar_url: "https://a.example/1.png" }))._id;
  bob = (await upsertGithubUser({ github_id: 2, username: "bob", avatar_url: "https://a.example/2.png" }))._id;
  db.tasks.docs.push(legacy("t1"), legacy("t2"), { ...legacy("owned-by-bob"), user_id: bob });
  db.weeklyPlans.docs.push({ _id: new ObjectId(), title: "p1", week_start: "2026-11-23", week_end: "2026-11-29", year_goal_id: null, progress: 0 });
  db.yearGoals.docs.push({ _id: new ObjectId(), year: 2026, title: "g1" }, { _id: new ObjectId(), year: 2026, title: "g2", user_id: null });
});

describe("migrate", () => {
  it("dry-run 은 건수만 세고 아무것도 바꾸지 않는다", async () => {
    const r = await migrate(adapter(), { username: "alice" });
    expect(r.apply).toBe(false);
    expect(r.collections).toEqual({
      tasks: { pending: 2, migrated: 0 },
      weeklyPlans: { pending: 1, migrated: 0 },
      yearGoals: { pending: 2, migrated: 0 }, // user_id 가 아예 없는 문서와 null 인 문서 모두
    });
    expect(db.tasks.docs.filter((d) => d.user_id === undefined)).toHaveLength(2);
    expect(db.tasks.indexes).toHaveLength(0);
  });

  it("--apply 는 소유자 없는 문서에만 user_id 를 쓰고 이미 소유자가 있는 문서는 건드리지 않는다", async () => {
    const r = await migrate(adapter(), { username: "alice", apply: true });
    expect(r.collections.tasks).toEqual({ pending: 2, migrated: 2 });
    expect(r.collections.weeklyPlans.migrated).toBe(1);
    expect(r.collections.yearGoals.migrated).toBe(2);

    expect(db.tasks.docs.filter((d) => hex(d.user_id) === alice.toHexString())).toHaveLength(2);
    expect(hex(db.tasks.docs.find((d) => d.title === "owned-by-bob")!.user_id)).toBe(bob.toHexString());
    expect(db.weeklyPlans.docs.every((d) => hex(d.user_id) === alice.toHexString())).toBe(true);
    expect(db.yearGoals.docs.every((d) => hex(d.user_id) === alice.toHexString())).toBe(true);
  });

  it("멱등: 두 번째 실행은 0건을 갱신한다", async () => {
    await migrate(adapter(), { username: "alice", apply: true });
    const again = await migrate(adapter(), { username: "alice", apply: true });
    expect(Object.values(again.collections)).toEqual([
      { pending: 0, migrated: 0 },
      { pending: 0, migrated: 0 },
      { pending: 0, migrated: 0 },
    ]);
  });

  it("다른 사용자로 다시 실행해도 이미 귀속된 문서는 뺏지 않는다", async () => {
    await migrate(adapter(), { username: "alice", apply: true });
    const r = await migrate(adapter(), { username: "bob", apply: true });
    expect(r.collections.tasks.migrated).toBe(0);
    expect(db.tasks.docs.filter((d) => hex(d.user_id) === alice.toHexString())).toHaveLength(2);
  });

  it("--apply 때만 user_id 로 시작하는 인덱스를 만든다", async () => {
    await migrate(adapter(), { username: "alice", apply: true });
    for (const name of COLLECTIONS) {
      expect(db[name as keyof FakeCollections].indexes.map((i) => i.key)).toContainEqual(INDEXES[name as keyof typeof INDEXES]);
    }
    expect(INDEXES.tasks).toEqual({ user_id: 1, date: 1, status: 1, order: 1 });
    expect(INDEXES.weeklyPlans).toEqual({ user_id: 1, week_start: 1 });
    expect(INDEXES.yearGoals).toEqual({ user_id: 1, year: 1 });
  });

  it("없는 사용자면 아무것도 바꾸지 않고 오류", async () => {
    await expect(migrate(adapter(), { username: "ghost", apply: true })).rejects.toThrow("사용자가 없습니다");
    expect(db.tasks.docs.filter((d) => d.user_id === undefined)).toHaveLength(2);
  });

  it("같은 username 이 둘 이상이면 오류(어느 쪽인지 모호)", async () => {
    db.users.docs.push({ _id: new ObjectId(), github_id: 3, username: "alice" });
    await expect(migrate(adapter(), { username: "alice", apply: true })).rejects.toThrow("둘 이상");
    expect(db.tasks.docs.filter((d) => d.user_id === undefined)).toHaveLength(2);
  });

  it("username 이 비어 있으면 오류", async () => {
    await expect(migrate(adapter(), { username: "" })).rejects.toThrow("--username");
  });
});

describe("레거시 문서는 fail closed — 마이그레이션 전엔 누구에게도 보이지 않는다", () => {
  async function asUser(id: ObjectId) {
    const { token } = await createSession(id);
    return new Request("http://localhost/api/tasks?date=2026-11-24", { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
  }
  const titles = async (res: Response) => ((await res.json()) as { title: string }[]).map((t) => t.title).sort();

  it("마이그레이션 전: alice 에게 legacy 가 안 보이고, 후: 보인다(bob 은 여전히 자기 것만)", async () => {
    expect(await titles(await tasksRoute.GET(await asUser(alice)))).toEqual([]);

    await migrate(adapter(), { username: "alice", apply: true });

    expect(await titles(await tasksRoute.GET(await asUser(alice)))).toEqual(["t1", "t2"]);
    expect(await titles(await tasksRoute.GET(await asUser(bob)))).toEqual(["owned-by-bob"]);
  });
});

describe("CLI 보조 함수", () => {
  it("parseArgs", () => {
    expect(parseArgs(["--username", "alice"])).toEqual({ username: "alice", apply: false });
    expect(parseArgs(["--username=alice", "--apply"])).toEqual({ username: "alice", apply: true });
    expect(() => parseArgs(["--wat"])).toThrow("알 수 없는 인자");
  });

  it("formatReport: dry-run 은 --apply 안내를, 대상이 없으면 없다고 말한다", async () => {
    const dry = formatReport(await migrate(adapter(), { username: "alice" }));
    expect(dry).toContain("[DRY-RUN]");
    expect(dry).toContain("--apply");
    await migrate(adapter(), { username: "alice", apply: true });
    expect(formatReport(await migrate(adapter(), { username: "alice" }))).toContain("귀속할 문서가 없습니다");
  });
});
