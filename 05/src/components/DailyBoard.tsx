"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/client";
import { STATUS_LABEL, STATUSES, type Status, type TaskDTO, type WeeklyPlanDTO } from "@/lib/types";
import { CARRY_LABEL, carryOverDate, type CarryUnit } from "@/lib/carryover";
import { boardHref, FILTERS, type StatusFilter } from "@/lib/filter";
import { addDays, isWithin, todayString } from "@/lib/week";
import Column from "./Column";
import ConfirmDialog from "./ConfirmDialog";
import ProgressBar from "./ProgressBar";
import { TaskCardView } from "./TaskCard";
import TaskForm, { type TaskFormValues } from "./TaskForm";
import { useToast } from "./Toast";

const noopSubscribe = () => () => {};

type Items = Record<Status, string[]>;
const emptyItems = (): Items => ({ todo: [], doing: [], done: [] });

function buildItems(tasks: TaskDTO[]): Items {
  const items = emptyItems();
  [...tasks].sort((a, b) => a.order - b.order).forEach((t) => items[t.status].push(t.id));
  return items;
}

export default function DailyBoard({ dateParam, filter }: { dateParam?: string; filter: StatusFilter }) {
  // 서버(UTC)와 브라우저의 날짜가 다를 수 있어 "오늘"은 마운트 후 클라이언트에서 계산
  const today = useSyncExternalStore(noopSubscribe, todayString, () => "");
  const date = dateParam ?? today;
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [items, setItems] = useState<Items>(emptyItems);
  const [plans, setPlans] = useState<WeeklyPlanDTO[]>([]);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const loading = loadedDate !== date; // 날짜가 바뀌면 다시 불러오는 중으로 간주
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<{ task?: TaskDTO } | null>(null);
  const [deleting, setDeleting] = useState<TaskDTO | null>(null);
  const snapshot = useRef<{ items: Items; tasks: TaskDTO[] } | null>(null);
  const { show, node: toastNode } = useToast();

  const load = useCallback(async () => {
    if (!date) return; // 오늘 날짜가 정해지기 전
    try {
      const [t, p] = await Promise.all([
        api<TaskDTO[]>(`/api/tasks?date=${date}`),
        api<WeeklyPlanDTO[]>("/api/weekly-plans"),
      ]);
      setTasks(t);
      setItems(buildItems(t));
      setPlans(p);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      setLoadedDate(date);
    }
  }, [date]);

  useEffect(() => {
    // 마운트·날짜 변경 시 외부(API) 데이터를 동기화하는 정당한 effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const planTitles = useMemo(() => new Map(plans.map((p) => [p.id, p.title])), [plans]);
  const weekPlans = plans.filter((p) => p.week_start <= date && date <= p.week_end);
  // 필터로 숨긴 컬럼은 렌더하지 않아 드롭 대상이 되지 않는다 (데이터는 그대로 유지)
  const visibleStatuses: readonly Status[] = filter === "all" ? STATUSES : [filter];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findContainer = (id: string): Status | undefined =>
    (STATUSES as readonly string[]).includes(id) ? (id as Status) : STATUSES.find((s) => items[s].includes(id));

  function onDragStart(e: DragStartEvent) {
    snapshot.current = { items, tasks };
    setActiveId(String(e.active.id));
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    const from = findContainer(activeKey);
    const to = findContainer(overKey);
    if (!from || !to || from === to) return;
    setItems((prev) => {
      const overIndex = prev[to].indexOf(overKey);
      let at = prev[to].length;
      if (overIndex >= 0) {
        const translated = active.rect.current.translated;
        const below = translated && translated.top > over.rect.top + over.rect.height / 2;
        at = overIndex + (below ? 1 : 0);
      }
      return {
        ...prev,
        [from]: prev[from].filter((i) => i !== activeKey),
        [to]: [...prev[to].slice(0, at), activeKey, ...prev[to].slice(at)],
      };
    });
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const snap = snapshot.current;
    snapshot.current = null;
    if (!snap) return;
    const id = String(active.id);
    const to = findContainer(id);
    if (!to) return setItems(snap.items);

    let finalItems = items;
    if (over) {
      const overKey = String(over.id);
      if (findContainer(overKey) === to && overKey !== to) {
        const oldIndex = items[to].indexOf(id);
        const newIndex = items[to].indexOf(overKey);
        if (oldIndex !== newIndex) {
          finalItems = { ...items, [to]: arrayMove(items[to], oldIndex, newIndex) };
          setItems(finalItems);
        }
      }
    }

    const from = STATUSES.find((s) => snap.items[s].includes(id));
    const col = finalItems[to];
    const idx = col.indexOf(id);
    if (from === to && idx === snap.items[to].indexOf(id)) return; // 제자리

    // 낙관적 반영 후 저장. 실패하면 드래그 전 상태로 복원한다.
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: to } : t)));
    try {
      await api<TaskDTO>(`/api/tasks/${id}`, {
        method: "PATCH",
        json: { status: to, prev_id: col[idx - 1] ?? null, next_id: col[idx + 1] ?? null },
      });
      await load(); // 서버가 계산한 순서·주간 진행률을 반영
    } catch (e) {
      setItems(snap.items);
      setTasks(snap.tasks);
      show(`${e instanceof Error ? e.message : "저장 실패"} — 원래 위치로 되돌렸습니다.`);
    }
  }

  function onDragCancel() {
    if (snapshot.current) {
      setItems(snapshot.current.items);
      setTasks(snapshot.current.tasks);
    }
    snapshot.current = null;
    setActiveId(null);
  }

  async function saveForm(values: TaskFormValues) {
    if (form?.task) {
      await api(`/api/tasks/${form.task.id}`, { method: "PATCH", json: values });
    } else {
      await api("/api/tasks", { method: "POST", json: values });
    }
    setForm(null);
    await load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    const t = deleting;
    setDeleting(null);
    try {
      await api(`/api/tasks/${t.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : "삭제하지 못했습니다.");
    }
  }

  async function carryOver(task: TaskDTO, unit: CarryUnit) {
    const target = carryOverDate(task.date, unit);
    // 연결된 계획 기간 밖이면 서버도 400 으로 막는다. 여기서는 사용자에게 해결 방법을 먼저 안내한다 (자동 해제 없음).
    const plan = task.weekly_plan_id ? plans.find((p) => p.id === task.weekly_plan_id) : undefined;
    if (plan && !isWithin(target, plan.week_start, plan.week_end)) {
      show(
        `${target}은(는) 연결된 계획 “${plan.title}”의 기간(${plan.week_start} ~ ${plan.week_end}) 밖이라 이월할 수 없습니다. 수정에서 연결을 해제하거나 다른 계획으로 바꿔 주세요.`,
      );
      return;
    }
    try {
      await api<TaskDTO>(`/api/tasks/${task.id}`, { method: "PATCH", json: { date: target } });
      await load();
      show(`“${task.title}”을(를) ${target}(${CARRY_LABEL[unit]})로 이월했습니다.`);
    } catch (e) {
      show(e instanceof Error ? e.message : "이월하지 못했습니다.");
    }
  }

  const activeTask = activeId ? tasksById.get(activeId) : undefined;
  const btn = "btn-outline";

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={boardHref(date ? addDays(date, -1) : undefined, filter)} className={btn} aria-label="이전 날">
          ◀
        </Link>
        <h1 className="min-w-28 text-[22px] font-semibold tracking-[-0.02em]">{date || " "}</h1>
        <Link href={boardHref(date ? addDays(date, 1) : undefined, filter)} className={btn} aria-label="다음 날">
          ▶
        </Link>
        {date !== today && (
          <Link href={boardHref(undefined, filter)} className={btn}>
            오늘
          </Link>
        )}
        <button onClick={() => setForm({})} className="btn-primary ml-auto">
          + 할 일 추가
        </button>
      </div>

      <nav aria-label="상태 필터" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const label = f === "all" ? "전체" : STATUS_LABEL[f];
          const count = f === "all" ? tasks.length : tasks.filter((t) => t.status === f).length;
          const active = f === filter;
          return (
            <Link
              key={f}
              href={boardHref(dateParam, f)}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${
                active
                  ? "border-foreground bg-foreground text-white"
                  : "border-[var(--card-border)] hover:bg-surface-soft"
              }`}
            >
              {label}
              {!loading && <span className={`ml-1 text-xs tabular-nums ${active ? "text-white/80" : "text-muted"}`}>{count}</span>}
            </Link>
          );
        })}
      </nav>

      {weekPlans.length > 0 && (
        <div className="mb-4 space-y-2 rounded-2xl border border-[var(--card-border)] bg-card p-3">
          <p className="text-xs font-semibold text-muted">이번 주 계획 진행률</p>
          {weekPlans.map((p) => (
            <div key={p.id}>
              <p className="mb-1 text-sm">{p.title}</p>
              <ProgressBar value={p.progress} />
            </div>
          ))}
        </div>
      )}

      {loadError ? (
        <div className="rounded-2xl border border-red-300 p-6 text-center text-sm">
          <p className="mb-3 text-red-600">{loadError}</p>
          <button onClick={load} className={btn}>
            다시 시도
          </button>
        </div>
      ) : loading ? (
        <p className="py-16 text-center text-sm text-muted">불러오는 중…</p>
      ) : (
        <>
          {tasks.length === 0 && (
            <p className="mb-3 text-center text-sm text-muted">이 날짜에는 할 일이 없습니다. “+ 할 일 추가”로 시작해 보세요.</p>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <div className={`grid gap-3 ${
              filter === "all" ? "grid-cols-[minmax(0,1fr)] md:grid-cols-[repeat(3,minmax(0,1fr))]" : "grid-cols-[minmax(0,1fr)]"
            }`}>
              {visibleStatuses.map((s) => (
                <Column
                  key={s}
                  status={s}
                  ids={items[s]}
                  tasksById={tasksById}
                  planTitles={planTitles}
                  onEdit={(t) => setForm({ task: t })}
                  onDelete={setDeleting}
                  onCarryOver={carryOver}
                />
              ))}
            </div>
            <DragOverlay>
              {activeTask ? (
                <div className="rounded-xl border border-accent bg-card p-3 shadow-lg">
                  <TaskCardView task={activeTask} onEdit={() => {}} onDelete={() => {}} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
      )}

      {form && (
        <TaskForm task={form.task} defaultDate={date} plans={plans} onSubmit={saveForm} onClose={() => setForm(null)} />
      )}
      {deleting && (
        <ConfirmDialog
          title="이 할 일을 삭제할까요?"
          description={`“${deleting.title}” — 삭제하면 연결된 주간 진행률이 다시 계산됩니다.`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
      {toastNode}
    </main>
  );
}
