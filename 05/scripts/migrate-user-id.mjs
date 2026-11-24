#!/usr/bin/env node
// 기존(로그인 도입 전) 문서에 user_id 를 채워 지정한 사용자에게 귀속시키는 마이그레이션.
//
//   node --env-file=.env.local scripts/migrate-user-id.mjs --username <GitHub 로그인 이름>          # dry-run (건수만 출력)
//   node --env-file=.env.local scripts/migrate-user-id.mjs --username <GitHub 로그인 이름> --apply  # 실제 반영
//
// - 대상 사용자는 먼저 GitHub 로 한 번 로그인해 users 컬렉션에 있어야 한다.
// - user_id 가 없는 문서(tasks, weeklyPlans, yearGoals)에만 쓴다. 이미 소유자가 있는 문서는 건드리지 않는다. 멱등.
// - 자동 귀속(첫 로그인 사용자가 데이터를 가져가기)은 일부러 하지 않는다. 누가 주인인지는 사람이 정한다.
import { MongoClient } from "mongodb";
import { pathToFileURL } from "node:url";

export const COLLECTIONS = ["tasks", "weeklyPlans", "yearGoals"];

/** --apply 때 함께 만드는 인덱스. 모든 조회가 user_id 로 시작하는 조건을 쓴다. */
export const INDEXES = {
  tasks: { user_id: 1, date: 1, status: 1, order: 1 },
  weeklyPlans: { user_id: 1, week_start: 1 },
  yearGoals: { user_id: 1, year: 1 },
};

// user_id 가 없거나 null 인 문서 (둘 다 "소유자 없음")
const UNOWNED = { user_id: null };

/**
 * @param db  mongodb Db (또는 collection(name) 을 가진 호환 객체)
 * @param opts { username: string, apply?: boolean }
 * @returns {Promise<{ apply: boolean, user: { id: string, username: string }, collections: Record<string, { pending: number, migrated: number }>, indexesCreated: boolean }>}
 *   컬렉션별 pending(마이그레이션 대상)·migrated(실제 반영 건수)
 */
export async function migrate(db, { username, apply = false }) {
  if (!username || typeof username !== "string") throw new Error("--username <GitHub 로그인 이름> 이 필요합니다.");

  const matches = await db.collection("users").find({ username }).limit(2).toArray();
  if (matches.length === 0) {
    throw new Error(`users 에 '${username}' 사용자가 없습니다. 먼저 그 계정으로 GitHub 로그인을 한 번 해 주세요. (아무것도 바꾸지 않았습니다)`);
  }
  if (matches.length > 1) throw new Error(`'${username}' 와 일치하는 사용자가 둘 이상입니다. (아무것도 바꾸지 않았습니다)`);
  const user = matches[0];

  /** @type {Record<string, { pending: number, migrated: number }>} */
  const collections = {};
  for (const name of COLLECTIONS) {
    const col = db.collection(name);
    const pending = await col.countDocuments(UNOWNED);
    let migrated = 0;
    if (apply && pending > 0) {
      const res = await col.updateMany(UNOWNED, { $set: { user_id: user._id } });
      migrated = res.modifiedCount;
    }
    collections[name] = { pending, migrated };
  }

  let indexesCreated = false;
  if (apply) {
    for (const name of COLLECTIONS) await db.collection(name).createIndex(INDEXES[name]);
    indexesCreated = true;
  }
  return { apply, user: { id: String(user._id), username: user.username }, collections, indexesCreated };
}

export function parseArgs(argv) {
  const out = { username: undefined, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--username") out.username = argv[++i];
    else if (a.startsWith("--username=")) out.username = a.slice("--username=".length);
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  return out;
}

export function formatReport(r) {
  const lines = [
    `${r.apply ? "[APPLY]" : "[DRY-RUN]"} 대상 사용자: ${r.user.username} (${r.user.id})`,
    ...Object.entries(r.collections).map(
      ([name, c]) => `  ${name.padEnd(12)} user_id 없음: ${String(c.pending).padStart(4)}건${r.apply ? `  → 귀속: ${c.migrated}건` : ""}`,
    ),
  ];
  const total = Object.values(r.collections).reduce((s, c) => s + c.pending, 0);
  if (!r.apply) lines.push(total === 0 ? "귀속할 문서가 없습니다." : "실제로 반영하려면 --apply 를 붙여 다시 실행하세요.");
  else lines.push(`완료. 인덱스 ${r.indexesCreated ? "확인/생성됨" : "생성 안 함"}.`);
  return lines.join("\n");
}

async function main() {
  const { username, apply } = parseArgs(process.argv.slice(2));
  const url = process.env.MONGODB_URL;
  if (!url) throw new Error("MONGODB_URL 이 없습니다. `node --env-file=.env.local scripts/migrate-user-id.mjs ...` 로 실행하세요.");
  const client = new MongoClient(url);
  try {
    await client.connect();
    console.log(formatReport(await migrate(client.db("todo"), { username, apply })));
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`오류: ${e.message}`); // 연결 문자열 등 비밀 값은 출력하지 않는다
    process.exit(1);
  });
}
