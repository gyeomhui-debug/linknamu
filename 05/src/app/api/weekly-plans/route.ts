import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { badRequest, cleanTitle, readBody, serverError } from "@/lib/api";
import { parseId, toWeeklyPlanDTO } from "@/lib/models";
import { getCollections } from "@/lib/mongodb";
import { addDays, isValidDate } from "@/lib/week";

// ?yearGoalId=<id> 로 특정 1년 목표에 연결된 계획만 조회, ?weekStart=YYYY-MM-DD 로 특정 주만 조회
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const filter: Record<string, unknown> = {};
  if (sp.has("yearGoalId")) {
    const gid = parseId(sp.get("yearGoalId"));
    if (!gid) return badRequest("잘못된 1년 목표 ID입니다.");
    filter.year_goal_id = gid;
  }
  if (sp.has("weekStart")) {
    const ws = sp.get("weekStart");
    if (!isValidDate(ws)) return badRequest("날짜 형식은 YYYY-MM-DD 입니다.");
    filter.week_start = ws;
  }
  try {
    const { weeklyPlans } = await getCollections();
    const docs = await weeklyPlans.find(filter).sort({ week_start: -1, _id: 1 }).toArray();
    return NextResponse.json(docs.map(toWeeklyPlanDTO));
  } catch (e) {
    return serverError(e, "주간 계획을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const title = cleanTitle(body?.title);
  if (!title) return badRequest("계획 제목을 입력해 주세요.");
  if (!isValidDate(body?.week_start)) return badRequest("시작일 형식은 YYYY-MM-DD 입니다.");
  const week_start = body.week_start as string;
  const week_end = body?.week_end === undefined ? addDays(week_start, 6) : body.week_end;
  if (!isValidDate(week_end)) return badRequest("종료일 형식은 YYYY-MM-DD 입니다.");
  if (week_end < week_start) return badRequest("종료일은 시작일보다 빠를 수 없습니다.");

  let year_goal_id: ObjectId | null = null;
  try {
    const { yearGoals, weeklyPlans } = await getCollections();
    if (body?.year_goal_id != null) {
      year_goal_id = parseId(body.year_goal_id);
      if (!year_goal_id || !(await yearGoals.findOne({ _id: year_goal_id }))) {
        return badRequest("연결할 1년 목표를 찾을 수 없습니다.");
      }
    }
    const doc = { _id: new ObjectId(), year_goal_id, week_start, week_end, title, progress: 0 };
    await weeklyPlans.insertOne(doc);
    return NextResponse.json(toWeeklyPlanDTO(doc), { status: 201 });
  } catch (e) {
    return serverError(e, "주간 계획을 저장하지 못했습니다.");
  }
}
