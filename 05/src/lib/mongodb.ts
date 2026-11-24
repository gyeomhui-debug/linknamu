import { MongoClient } from "mongodb";
import type { Session, Task, User, WeeklyPlan, YearGoal } from "./models";

const globalForMongo = globalThis as unknown as {
  _todoMongoClient?: Promise<MongoClient>;
};

function getClient(): Promise<MongoClient> {
  const url = process.env.MONGODB_URL;
  if (!url) throw new Error("MONGODB_URL 환경 변수가 설정되지 않았습니다.");
  // 개발 중 핫 리로드 때 연결이 계속 늘어나지 않도록 전역에 보관
  globalForMongo._todoMongoClient ??= new MongoClient(url).connect();
  return globalForMongo._todoMongoClient;
}

export async function getDb() {
  const client = await getClient();
  return client.db("todo");
}

export async function getCollections() {
  const db = await getDb();
  return {
    yearGoals: db.collection<YearGoal>("yearGoals"),
    weeklyPlans: db.collection<WeeklyPlan>("weeklyPlans"),
    tasks: db.collection<Task>("tasks"),
    users: db.collection<User>("users"),
    sessions: db.collection<Session>("sessions"),
  };
}
