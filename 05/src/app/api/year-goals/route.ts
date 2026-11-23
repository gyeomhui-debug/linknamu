import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { badRequest, cleanTitle, readBody, serverError } from "@/lib/api";
import { toYearGoalDTO } from "@/lib/models";
import { getCollections } from "@/lib/mongodb";
import { getGoalProgressMap } from "@/lib/progress";

export async function GET() {
  try {
    const { yearGoals } = await getCollections();
    const [docs, progress] = await Promise.all([
      yearGoals.find().sort({ year: -1, _id: 1 }).toArray(),
      getGoalProgressMap(),
    ]);
    return NextResponse.json(docs.map((d) => toYearGoalDTO(d, progress.get(d._id.toHexString()) ?? 0)));
  } catch (e) {
    return serverError(e, "1년 목표를 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const title = cleanTitle(body?.title);
  const year = Number(body?.year);
  if (!title) return badRequest("목표 제목을 입력해 주세요.");
  if (!Number.isInteger(year) || year < 1970 || year > 2200) return badRequest("연도가 올바르지 않습니다.");
  try {
    const { yearGoals } = await getCollections();
    const doc = { _id: new ObjectId(), year, title };
    await yearGoals.insertOne(doc);
    return NextResponse.json(toYearGoalDTO(doc), { status: 201 });
  } catch (e) {
    return serverError(e, "1년 목표를 저장하지 못했습니다.");
  }
}
