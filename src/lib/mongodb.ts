import { MongoClient } from "mongodb";

const globalForMongo = globalThis as unknown as {
  _mongoClient?: Promise<MongoClient>;
};

function getClient(): Promise<MongoClient> {
  const url = process.env.MONGODB_URL;
  if (!url) throw new Error("MONGODB_URL 환경 변수가 설정되지 않았습니다.");
  // 개발 중 핫 리로드 때 연결이 계속 늘어나지 않도록 전역에 보관
  globalForMongo._mongoClient ??= new MongoClient(url).connect();
  return globalForMongo._mongoClient;
}

export async function getClicksCollection() {
  const client = await getClient();
  return client.db("linknamu").collection<{ _id: number; count: number }>("clicks");
}
