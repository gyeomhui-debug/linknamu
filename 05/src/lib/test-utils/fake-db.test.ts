import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { FakeCollection } from "./fake-db";

// 가짜 DB 가 실제 드라이버와 어긋나면 그 위의 모든 테스트가 거짓 안심을 준다. 핵심 의미만 고정해 둔다.
describe("FakeCollection 은 드라이버처럼 동작한다", () => {
  const seed = () => {
    const c = new FakeCollection();
    c.docs.push({ _id: new ObjectId(), n: 1, owner: new ObjectId(), at: new Date(0), nested: { a: 1 } });
    return c;
  };

  it("읽기 결과는 복사본이라 수정해도 저장소가 바뀌지 않는다", async () => {
    const c = seed();
    const read = (await c.findOne({ n: 1 }))!;
    read.n = 99;
    (read.nested as { a: number }).a = 99;
    expect(c.docs[0].n).toBe(1);
    expect((c.docs[0].nested as { a: number }).a).toBe(1);

    const [fromArray] = await c.find({}).toArray();
    fromArray.n = 5;
    expect((await c.find({}).next())!.n).toBe(1);
  });

  it("복사본도 ObjectId·Date 의 의미를 유지한다", async () => {
    const c = seed();
    const read = (await c.findOne({}))!;
    expect(read._id).toBeInstanceOf(ObjectId);
    expect((read._id as ObjectId).equals(c.docs[0]._id as ObjectId)).toBe(true);
    expect(read.at).toBeInstanceOf(Date);
  });

  it("findOneAndUpdate: returnDocument 기본은 before, after 를 주면 수정 후 문서", async () => {
    const c = seed();
    const before = await c.findOneAndUpdate({ n: 1 }, { $set: { n: 2 } });
    expect(before!.n).toBe(1);
    expect(c.docs[0].n).toBe(2);
    const after = await c.findOneAndUpdate({ n: 2 }, { $set: { n: 3 } }, { returnDocument: "after" });
    expect(after!.n).toBe(3);
  });

  it("수정 전 문서와 수정 후 문서를 서로 비교할 수 있다 (같은 객체가 아니다)", async () => {
    const c = seed();
    const current = (await c.findOne({ n: 1 }))!;
    const updated = (await c.findOneAndUpdate({ n: 1 }, { $set: { n: 2 } }, { returnDocument: "after" }))!;
    expect(current.n).toBe(1);
    expect(updated.n).toBe(2);
  });

  it("upsert: 없으면 만들고 $setOnInsert 는 처음 만들 때만 적용된다", async () => {
    const c = new FakeCollection();
    await c.findOneAndUpdate({ k: 1 }, { $set: { v: "a" }, $setOnInsert: { first: true } }, { upsert: true, returnDocument: "after" });
    await c.findOneAndUpdate({ k: 1 }, { $set: { v: "b" }, $setOnInsert: { first: false } }, { upsert: true, returnDocument: "after" });
    expect(c.docs).toHaveLength(1);
    expect(c.docs[0]).toMatchObject({ k: 1, v: "b", first: true });
  });

  it("null 과 누락은 같은 값으로 매치된다 (user_id: null)", async () => {
    const c = new FakeCollection();
    c.docs.push({ _id: new ObjectId() }, { _id: new ObjectId(), user_id: null }, { _id: new ObjectId(), user_id: new ObjectId() });
    expect(await c.countDocuments({ user_id: null })).toBe(2);
  });
});
