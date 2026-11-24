import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { badRequest, cleanTitle, readBody, serverError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { toYearGoalDTO } from "@/lib/models";
import { getCollections } from "@/lib/mongodb";
import { getGoalProgressMap } from "@/lib/progress";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  try {
    const { yearGoals } = await getCollections();
    const [docs, progress] = await Promise.all([
      yearGoals.find({ user_id: auth.user._id }).sort({ year: -1, _id: 1 }).toArray(),
      getGoalProgressMap(auth.user._id),
    ]);
    return NextResponse.json(docs.map((d) => toYearGoalDTO(d, progress.get(d._id.toHexString()) ?? 0)));
  } catch (e) {
    return serverError(e, "1년 목표를 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const body = await readBody(request);
  const title = cleanTitle(body?.title);
  const year = Number(body?.year);
  if (!title) return badRequest("목표 제목을 입력해 주세요.");
  if (!Number.isInteger(year) || year < 1970 || year > 2200) return badRequest("연도가 올바르지 않습니다.");
  try {
    const { yearGoals } = await getCollections();
    const doc = { _id: new ObjectId(), user_id: auth.user._id, year, title };
    await yearGoals.insertOne(doc);
    return NextResponse.json(toYearGoalDTO(doc), { status: 201 });
  } catch (e) {
    return serverError(e, "1년 목표를 저장하지 못했습니다.");
  }
}
