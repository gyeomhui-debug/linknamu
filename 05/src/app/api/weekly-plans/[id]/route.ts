import { NextResponse } from "next/server";
import { badRequest, cleanTitle, notFound, readBody, serverError } from "@/lib/api";
import { parseId, toWeeklyPlanDTO } from "@/lib/models";
import { getCollections } from "@/lib/mongodb";
import { parseRetrospective, RETRO_MAX } from "@/lib/retro";
import { isValidDate } from "@/lib/week";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const id = parseId((await params).id);
  if (!id) return badRequest("잘못된 ID입니다.");
  const body = await readBody(request);
  if (!body) return badRequest("요청 본문이 올바르지 않습니다.");

  try {
    const { weeklyPlans, yearGoals, tasks } = await getCollections();
    const current = await weeklyPlans.findOne({ _id: id });
    if (!current) return notFound();

    const $set: Record<string, unknown> = {};
    if ("title" in body) {
      const title = cleanTitle(body.title);
      if (!title) return badRequest("계획 제목을 입력해 주세요.");
      $set.title = title;
    }
    if ("week_start" in body) {
      if (!isValidDate(body.week_start)) return badRequest("시작일 형식은 YYYY-MM-DD 입니다.");
      $set.week_start = body.week_start;
    }
    if ("week_end" in body) {
      if (!isValidDate(body.week_end)) return badRequest("종료일 형식은 YYYY-MM-DD 입니다.");
      $set.week_end = body.week_end;
    }
    const start = ($set.week_start ?? current.week_start) as string;
    const end = ($set.week_end ?? current.week_end) as string;
    if (end < start) return badRequest("종료일은 시작일보다 빠를 수 없습니다.");

    // 기간을 바꿨을 때 이미 연결된 할 일이 기간 밖으로 나가면 막는다
    if ("week_start" in body || "week_end" in body) {
      const outside = await tasks.countDocuments({
        weekly_plan_id: id,
        $or: [{ date: { $lt: start } }, { date: { $gt: end } }],
      });
      if (outside > 0) {
        return badRequest(`변경한 기간(${start} ~ ${end}) 밖에 연결된 할 일이 ${outside}개 있습니다. 먼저 날짜를 옮기거나 연결을 해제해 주세요.`);
      }
    }

    // 주간 회고 메모 (빈 문자열이면 메모 삭제)
    if ("retrospective" in body) {
      const retro = parseRetrospective(body.retrospective);
      if (retro === null) return badRequest(`회고 메모는 ${RETRO_MAX}자 이하의 문자열이어야 합니다.`);
      $set.retrospective = retro;
    }

    // 1년 목표 연결 변경/해제 (null 이면 해제)
    if ("year_goal_id" in body) {
      if (body.year_goal_id === null) {
        $set.year_goal_id = null;
      } else {
        const gid = parseId(body.year_goal_id);
        if (!gid || !(await yearGoals.findOne({ _id: gid }))) {
          return badRequest("연결할 1년 목표를 찾을 수 없습니다.");
        }
        $set.year_goal_id = gid;
      }
    }
    if (Object.keys($set).length === 0) return badRequest("변경할 내용이 없습니다.");

    const doc = await weeklyPlans.findOneAndUpdate({ _id: id }, { $set }, { returnDocument: "after" });
    return doc ? NextResponse.json(toWeeklyPlanDTO(doc)) : notFound();
  } catch (e) {
    return serverError(e, "주간 계획을 수정하지 못했습니다.");
  }
}

// 삭제 시 하위 할 일은 지우지 않고 연결만 해제한다.
export async function DELETE(_request: Request, { params }: Ctx) {
  const id = parseId((await params).id);
  if (!id) return badRequest("잘못된 ID입니다.");
  try {
    const { weeklyPlans, tasks } = await getCollections();
    const { deletedCount } = await weeklyPlans.deleteOne({ _id: id });
    if (deletedCount === 0) return notFound();
    await tasks.updateMany({ weekly_plan_id: id }, { $set: { weekly_plan_id: null } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "주간 계획을 삭제하지 못했습니다.");
  }
}
