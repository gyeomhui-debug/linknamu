import { NextResponse } from "next/server";
import type { ObjectId } from "mongodb";
import { badRequest, cleanTitle, notFound, readBody, serverError } from "@/lib/api";
import { isStatus, parseId, toTaskDTO, type Task } from "@/lib/models";
import { getCollections } from "@/lib/mongodb";
import { between, needsRenumber } from "@/lib/order";
import { recalcWeeklyPlan } from "@/lib/progress";
import { isValidDate, isWithin, rangeMessage } from "@/lib/week";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH body (모두 선택):
 *  title, date, status, weekly_plan_id(null이면 연결 해제)
 *  prev_id / next_id: 이동 후 바로 위·아래에 올 카드 ID(없으면 null). 둘 중 하나라도 있으면
 *  대상 컬럼(date+status) 안에서 그 사이에 끼워 넣는다. 위치 키가 없는데 컬럼이 바뀌면 맨 뒤에 붙인다.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const id = parseId((await params).id);
  if (!id) return badRequest("잘못된 ID입니다.");
  const body = await readBody(request);
  if (!body) return badRequest("요청 본문이 올바르지 않습니다.");

  try {
    const { tasks, weeklyPlans } = await getCollections();
    const current = await tasks.findOne({ _id: id });
    if (!current) return notFound();

    const $set: Partial<Task> = {};
    if ("title" in body) {
      const title = cleanTitle(body.title);
      if (!title) return badRequest("제목을 입력해 주세요.");
      $set.title = title;
    }
    if ("date" in body) {
      if (!isValidDate(body.date)) return badRequest("날짜 형식은 YYYY-MM-DD 입니다.");
      $set.date = body.date;
    }
    if ("status" in body) {
      if (!isStatus(body.status)) return badRequest("상태는 todo / doing / done 중 하나여야 합니다.");
      $set.status = body.status;
    }
    if ("weekly_plan_id" in body) {
      if (body.weekly_plan_id === null) {
        $set.weekly_plan_id = null;
      } else {
        const pid = parseId(body.weekly_plan_id);
        if (!pid || !(await weeklyPlans.findOne({ _id: pid }))) {
          return badRequest("연결할 주간 계획을 찾을 수 없습니다.");
        }
        $set.weekly_plan_id = pid;
      }
    }

    // 날짜–기간 정합성: 날짜나 연결이 바뀔 때, 최종 연결 계획의 기간 안이어야 한다.
    // (상태·순서만 바뀌는 드래그는 검사하지 않아, 예전에 저장된 기간 밖 데이터도 이동은 가능)
    const targetPlanId = "weekly_plan_id" in body ? ($set.weekly_plan_id ?? null) : current.weekly_plan_id;
    if (targetPlanId && ("date" in body || "weekly_plan_id" in body)) {
      const plan = await weeklyPlans.findOne({ _id: targetPlanId });
      const date = $set.date ?? current.date;
      if (plan && !isWithin(date, plan.week_start, plan.week_end)) {
        return badRequest(rangeMessage(plan.week_start, plan.week_end));
      }
    }

    const hasPosition = "prev_id" in body || "next_id" in body;
    const targetDate = $set.date ?? current.date;
    const targetStatus = $set.status ?? current.status;
    const columnChanged = targetDate !== current.date || targetStatus !== current.status;

    if (Object.keys($set).length === 0 && !hasPosition) return badRequest("변경할 내용이 없습니다.");

    let renumber: ObjectId[] | null = null; // 재번호가 필요할 때의 컬럼 전체 순서
    if (hasPosition) {
      const prevId = body.prev_id == null ? null : parseId(body.prev_id);
      const nextId = body.next_id == null ? null : parseId(body.next_id);
      if ((body.prev_id != null && !prevId) || (body.next_id != null && !nextId)) {
        return badRequest("잘못된 이웃 카드 ID입니다.");
      }
      const [prev, next] = await Promise.all([
        prevId ? tasks.findOne({ _id: prevId, date: targetDate, status: targetStatus }) : null,
        nextId ? tasks.findOne({ _id: nextId, date: targetDate, status: targetStatus }) : null,
      ]);
      if ((prevId && !prev) || (nextId && !next)) return badRequest("이웃 카드가 대상 컬럼에 없습니다.");

      if (needsRenumber(prev?.order ?? null, next?.order ?? null)) {
        const col = await tasks
          .find({ date: targetDate, status: targetStatus, _id: { $ne: id } })
          .sort({ order: 1, _id: 1 })
          .toArray();
        const ids = col.map((t) => t._id);
        const at = prevId ? ids.findIndex((x) => x.equals(prevId)) + 1 : 0;
        ids.splice(at, 0, id);
        renumber = ids;
        $set.order = ids.findIndex((x) => x.equals(id)) + 1;
      } else {
        $set.order = between(prev?.order ?? null, next?.order ?? null);
      }
    } else if (columnChanged) {
      const last = await tasks
        .find({ date: targetDate, status: targetStatus })
        .sort({ order: -1 })
        .limit(1)
        .next();
      $set.order = (last?.order ?? 0) + 1;
    }

    const now = new Date();
    $set.updated_at = now;
    // 상태가 실제로 달라질 때만 상태 변경 시각을 기록 (제목·날짜·순서 수정은 유지)
    if ($set.status !== undefined && $set.status !== current.status) $set.status_changed_at = now;
    const updated = await tasks.findOneAndUpdate({ _id: id }, { $set }, { returnDocument: "after" });
    if (!updated) return notFound();

    if (renumber) {
      // 이동한 카드 자신은 위에서 이미 저장했으므로 나머지 카드만 번호를 다시 매긴다
      const ops = renumber.flatMap((x, i) =>
        x.equals(id) ? [] : [{ updateOne: { filter: { _id: x }, update: { $set: { order: i + 1 } } } }],
      );
      if (ops.length > 0) await tasks.bulkWrite(ops);
    }

    // 상태·연결이 바뀌었을 수 있으므로 이전·새 계획을 모두 재계산
    const before = current.weekly_plan_id?.toHexString() ?? null;
    const after = updated.weekly_plan_id?.toHexString() ?? null;
    await recalcWeeklyPlan(current.weekly_plan_id);
    if (after !== before) await recalcWeeklyPlan(updated.weekly_plan_id);
    return NextResponse.json(toTaskDTO(updated));
  } catch (e) {
    return serverError(e, "할 일을 수정하지 못했습니다.");
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const id = parseId((await params).id);
  if (!id) return badRequest("잘못된 ID입니다.");
  try {
    const { tasks } = await getCollections();
    const doc = await tasks.findOneAndDelete({ _id: id });
    if (!doc) return notFound();
    await recalcWeeklyPlan(doc.weekly_plan_id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "할 일을 삭제하지 못했습니다.");
  }
}
