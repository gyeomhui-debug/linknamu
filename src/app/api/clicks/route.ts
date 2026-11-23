import { NextResponse } from "next/server";
import { links } from "@/lib/links";
import { getClicksCollection } from "@/lib/mongodb";

// 모든 링크의 클릭 수를 한 번에 반환: { "1": 42, "2": 7, ... }
export async function GET() {
  try {
    const col = await getClicksCollection();
    const docs = await col.find().toArray();
    const result: Record<number, number> = Object.fromEntries(links.map((l) => [l.id, 0]));
    for (const d of docs) if (d._id in result) result[d._id] = d.count;
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "클릭 수를 불러오지 못했습니다." }, { status: 500 });
  }
}

// 해당 링크의 클릭 수를 1 증가: body { id }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  if (!links.some((l) => l.id === id)) {
    return NextResponse.json({ error: "알 수 없는 링크입니다." }, { status: 400 });
  }
  try {
    const col = await getClicksCollection();
    const doc = await col.findOneAndUpdate(
      { _id: id },
      { $inc: { count: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    return NextResponse.json({ id, count: doc?.count ?? 1 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "클릭 수를 저장하지 못했습니다." }, { status: 500 });
  }
}
