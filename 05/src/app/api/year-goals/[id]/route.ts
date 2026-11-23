import { NextResponse } from "next/server";
import { badRequest, cleanTitle, notFound, readBody, serverError } from "@/lib/api";
import { parseId, toYearGoalDTO } from "@/lib/models";
import { getCollections } from "@/lib/mongodb";
import { getGoalProgressMap } from "@/lib/progress";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const id = parseId((await params).id);
  if (!id) return badRequest("잘못된 ID입니다.");
  const body = await readBody(request);
  if (!body) return badRequest("요청 본문이 올바르지 않습니다.");

  const $set: Record<string, unknown> = {};
  if ("title" in body) {
    const title = cleanTitle(body.title);
    if (!title) return badRequest("목표 제목을 입력해 주세요.");
    $set.title = title;
  }
  if ("year" in body) {
    const year = Number(body.year);
    if (!Number.isInteger(year) || year < 1970 || year > 2200) return badRequest("연도가 올바르지 않습니다.");
    $set.year = year;
  }
  if (Object.keys($set).length === 0) return badRequest("변경할 내용이 없습니다.");

  try {
    const { yearGoals } = await getCollections();
    const doc = await yearGoals.findOneAndUpdate({ _id: id }, { $set }, { returnDocument: "after" });
    if (!doc) return notFound();
    const progress = await getGoalProgressMap();
    return NextResponse.json(toYearGoalDTO(doc, progress.get(id.toHexString()) ?? 0));
  } catch (e) {
    return serverError(e, "1년 목표를 수정하지 못했습니다.");
  }
}

// 삭제 시 하위 주간 계획은 지우지 않고 연결만 해제한다.
export async function DELETE(_request: Request, { params }: Ctx) {
  const id = parseId((await params).id);
  if (!id) return badRequest("잘못된 ID입니다.");
  try {
    const { yearGoals, weeklyPlans } = await getCollections();
    const { deletedCount } = await yearGoals.deleteOne({ _id: id });
    if (deletedCount === 0) return notFound();
    await weeklyPlans.updateMany({ year_goal_id: id }, { $set: { year_goal_id: null } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "1년 목표를 삭제하지 못했습니다.");
  }
}
