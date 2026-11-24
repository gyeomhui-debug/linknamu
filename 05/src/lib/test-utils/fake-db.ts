// 테스트 전용 인메모리 가짜 MongoDB 컬렉션. 이 앱의 라우트가 쓰는 연산만 지원한다.
// 실제 드라이버와 의미가 같아야 하는 부분(ObjectId 동등 비교, $ne/$lt/$gt/$or/$in, upsert)만 구현했다.
import { ObjectId } from "mongodb";

type Doc = Record<string, unknown>;
type Filter = Record<string, unknown>;

const norm = (v: unknown): unknown =>
  v instanceof ObjectId ? `oid:${v.toHexString()}` : v instanceof Date ? `date:${v.getTime()}` : v;

const get = (d: Doc, k: string): unknown => d[k];

/** 실제 드라이버처럼 읽기 결과는 항상 복사본이다. 저장된 객체를 공유하면 수정 전/후 비교(before/after)가 무의미해진다. */
function clone<T>(v: T): T {
  if (v instanceof ObjectId) return new ObjectId(v.toHexString()) as T;
  if (v instanceof Date) return new Date(v.getTime()) as T;
  if (Array.isArray(v)) return v.map(clone) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) as T;
  return v;
}

function matchField(actual: unknown, cond: unknown): boolean {
  if (cond !== null && typeof cond === "object" && !(cond instanceof ObjectId) && !(cond instanceof Date)) {
    const ops = cond as Record<string, unknown>;
    return Object.entries(ops).every(([op, val]) => {
      switch (op) {
        case "$ne":
          return norm(actual ?? null) !== norm(val);
        case "$lt":
          return actual != null && (actual as string) < (val as string);
        case "$gt":
          return actual != null && (actual as string) > (val as string);
        case "$in":
          return (val as unknown[]).some((x) => norm(x) === norm(actual));
        default:
          throw new Error(`fake-db: 지원하지 않는 연산자 ${op}`);
      }
    });
  }
  return norm(actual ?? null) === norm(cond);
}

export function matches(doc: Doc, filter: Filter): boolean {
  return Object.entries(filter).every(([k, cond]) => {
    if (k === "$or") return (cond as Filter[]).some((f) => matches(doc, f));
    return matchField(get(doc, k), cond);
  });
}

function applyUpdate(doc: Doc, update: Doc, inserting: boolean) {
  for (const [op, fields] of Object.entries(update)) {
    if (op === "$set") Object.assign(doc, fields);
    else if (op === "$setOnInsert") {
      if (inserting) Object.assign(doc, fields);
    } else throw new Error(`fake-db: 지원하지 않는 업데이트 ${op}`);
  }
}

class Cursor {
  constructor(private docs: Doc[]) {}
  sort(spec: Record<string, 1 | -1>) {
    const entries = Object.entries(spec);
    this.docs = [...this.docs].sort((a, b) => {
      for (const [k, dir] of entries) {
        const x = norm(a[k]) as string | number;
        const y = norm(b[k]) as string | number;
        if (x < y) return -dir;
        if (x > y) return dir;
      }
      return 0;
    });
    return this;
  }
  limit(n: number) {
    this.docs = this.docs.slice(0, n);
    return this;
  }
  async toArray() {
    return this.docs.map(clone);
  }
  async next() {
    return this.docs[0] ? clone(this.docs[0]) : null;
  }
}

export class FakeCollection {
  docs: Doc[] = [];
  indexes: { key: Doc; options?: Doc }[] = [];

  async createIndex(key: Doc, options?: Doc) {
    this.indexes.push({ key, options });
    return "idx";
  }
  async insertOne(doc: Doc) {
    this.docs.push(clone(doc));
    return { insertedId: doc._id };
  }
  async findOne(filter: Filter) {
    const d = this.docs.find((x) => matches(x, filter));
    return d ? clone(d) : null;
  }
  find(filter: Filter = {}) {
    return new Cursor(this.docs.filter((d) => matches(d, filter)));
  }
  async countDocuments(filter: Filter = {}) {
    return this.docs.filter((d) => matches(d, filter)).length;
  }
  /** 실제 드라이버처럼 returnDocument 기본값은 "before" (이 앱의 호출부는 모두 "after" 를 명시한다). */
  async findOneAndUpdate(filter: Filter, update: Doc, options?: { upsert?: boolean; returnDocument?: "before" | "after" }) {
    let doc = this.docs.find((d) => matches(d, filter));
    const before = doc ? clone(doc) : null;
    let inserting = false;
    if (!doc) {
      if (!options?.upsert) return null;
      // upsert: 등호 조건의 값으로 새 문서를 시작한다
      doc = Object.fromEntries(Object.entries(filter).filter(([k, v]) => !k.startsWith("$") && (v === null || typeof v !== "object" || v instanceof ObjectId || v instanceof Date)));
      this.docs.push(doc);
      inserting = true;
    }
    applyUpdate(doc, update, inserting);
    return options?.returnDocument === "after" ? clone(doc) : before;
  }
  async updateOne(filter: Filter, update: Doc) {
    const doc = this.docs.find((d) => matches(d, filter));
    if (doc) applyUpdate(doc, update, false);
    return { matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 };
  }
  async updateMany(filter: Filter, update: Doc) {
    const hit = this.docs.filter((d) => matches(d, filter));
    hit.forEach((d) => applyUpdate(d, update, false));
    return { matchedCount: hit.length, modifiedCount: hit.length };
  }
  async findOneAndDelete(filter: Filter) {
    const i = this.docs.findIndex((d) => matches(d, filter));
    return i === -1 ? null : this.docs.splice(i, 1)[0];
  }
  async deleteOne(filter: Filter) {
    const i = this.docs.findIndex((d) => matches(d, filter));
    if (i !== -1) this.docs.splice(i, 1);
    return { deletedCount: i === -1 ? 0 : 1 };
  }
  async bulkWrite(ops: { updateOne: { filter: Filter; update: Doc } }[]) {
    for (const op of ops) await this.updateOne(op.updateOne.filter, op.updateOne.update);
    return {};
  }
}

export type FakeCollections = {
  yearGoals: FakeCollection;
  weeklyPlans: FakeCollection;
  tasks: FakeCollection;
  users: FakeCollection;
  sessions: FakeCollection;
};

export function createFakeDb(): FakeCollections {
  return {
    yearGoals: new FakeCollection(),
    weeklyPlans: new FakeCollection(),
    tasks: new FakeCollection(),
    users: new FakeCollection(),
    sessions: new FakeCollection(),
  };
}
