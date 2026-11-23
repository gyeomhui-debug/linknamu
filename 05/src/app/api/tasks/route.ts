import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { badRequest, cleanTitle, readBody, serverError } from "@/lib/api";
import { parseId, toTaskDTO, type Task } from "@/lib/models";
import { getCollections } from "@/lib/mongodb";
import { recalcWeeklyPlan } from "@/lib/progress";
import { isValidDate, isWithin, rangeMessage } from "@/lib/week";

// ?date=YYYY-MM-DD (날짜별) 또는 ?weeklyPlanId=<id> (계획별). 둘 다 없으면 400.
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const filter: Record<string, unknown> = {};
  if (sp.has("date")) {
    const date = sp.get("date");
    if (!isValidDate(date)) return badRequest("날짜 형식은 YYYY-MM-DD 입니다.");
    filter.date = date;
  }
  if (sp.has("weeklyPlanId")) {
    const pid = parseId(sp.get("weeklyPlanId"));
    if (!pid) return badRequest("잘못된 주간 계획 ID입니다.");
    filter.weekly_plan_id = pid;
  }
  if (Object.keys(filter).length === 0) return badRequest("date 또는 weeklyPlanId가 필요합니다.");
  try {
    const { tasks } = await getCollections();
    const docs = await tasks.find(filter).sort({ order: 1, _id: 1 }).toArray();
    return NextResponse.json(docs.map(toTaskDTO));
  } catch (e) {
    return serverError(e, "할 일을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const title = cleanTitle(body?.title);
  if (!title) return badRequest("제목을 입력해 주세요.");
  if (!isValidDate(body?.date)) return badRequest("날짜 형식은 YYYY-MM-DD 입니다.");
  const date = body.date as string;

  try {
    const { tasks, weeklyPlans } = await getCollections();

    let weekly_plan_id: ObjectId | null = null;
    if (body?.weekly_plan_id != null) {
      weekly_plan_id = parseId(body.weekly_plan_id);
      const plan = weekly_plan_id ? await weeklyPlans.findOne({ _id: weekly_plan_id }) : null;
      if (!plan) return badRequest("연결할 주간 계획을 찾을 수 없습니다.");
      if (!isWithin(date, plan.week_start, plan.week_end)) {
        return badRequest(rangeMessage(plan.week_start, plan.week_end));
      }
    }

    // 같은 날짜의 todo 컬럼 맨 뒤에 추가
    const last = await tasks.find({ date, status: "todo" }).sort({ order: -1 }).limit(1).next();
    const now = new Date();
    const doc: Task = {
      _id: new ObjectId(),
      weekly_plan_id,
      date,
      title,
      status: "todo",
      order: (last?.order ?? 0) + 1,
      updated_at: now,
      status_changed_at: now,
    };
    await tasks.insertOne(doc);
    await recalcWeeklyPlan(weekly_plan_id);
    return NextResponse.json(toTaskDTO(doc), { status: 201 });
  } catch (e) {
    return serverError(e, "할 일을 저장하지 못했습니다.");
  }
}
