"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CARRY_LABEL, canCarryOver, type CarryUnit } from "@/lib/carryover";
import type { TaskDTO } from "@/lib/types";

type Props = {
  task: TaskDTO;
  planTitle?: string;
  onEdit: (t: TaskDTO) => void;
  onDelete: (t: TaskDTO) => void;
  /** 주어지면 todo/doing 카드에 이월 버튼을 보여 준다 (done 은 항상 숨김) */
  onCarryOver?: (t: TaskDTO, unit: CarryUnit) => void;
};

export function TaskCardView({ task, planTitle, onEdit, onDelete, onCarryOver }: Props) {
  return (
    <>
      <p className="text-sm font-medium [overflow-wrap:anywhere]">{task.title}</p>
      {planTitle && <p className="mt-1 truncate text-xs text-accent">🔗 {planTitle}</p>}
      {onCarryOver && canCarryOver(task.status) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {(["day", "week"] as const).map((unit) => (
            <button
              key={unit}
              onClick={() => onCarryOver(task, unit)}
              className="rounded-md border border-[var(--card-border)] px-2 py-1 text-xs text-muted hover:bg-surface-soft"
              aria-label={`${task.title} ${CARRY_LABEL[unit]} 이월`}
            >
              ⏭ {CARRY_LABEL[unit]}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted" title="상태가 마지막으로 바뀐 시각">
          {new Date(task.status_changed_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="flex gap-1">
          <button
            onClick={() => onEdit(task)}
            className="rounded px-2 py-1 text-xs text-muted hover:bg-surface-soft"
            aria-label={`${task.title} 수정`}
          >
            수정
          </button>
          <button
            onClick={() => onDelete(task)}
            className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-500/10"
            aria-label={`${task.title} 삭제`}
          >
            삭제
          </button>
        </span>
      </div>
    </>
  );
}

export default function TaskCard(props: Props) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: props.task.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`touch-manipulation list-none rounded-xl border border-[var(--card-border)] bg-card p-3 card-float ${
        isDragging ? "opacity-40" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      <TaskCardView {...props} />
    </li>
  );
}
