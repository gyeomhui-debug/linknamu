"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { CarryUnit } from "@/lib/carryover";
import { STATUS_LABEL, type Status, type TaskDTO } from "@/lib/types";
import TaskCard from "./TaskCard";

type Props = {
  status: Status;
  ids: string[];
  tasksById: Map<string, TaskDTO>;
  planTitles: Map<string, string>;
  onEdit: (t: TaskDTO) => void;
  onDelete: (t: TaskDTO) => void;
  onCarryOver: (t: TaskDTO, unit: CarryUnit) => void;
};

const DOT: Record<Status, string> = { todo: "bg-gray-400", doing: "bg-amber-500", done: "bg-emerald-500" };

export default function Column({ status, ids, tasksById, planTitles, onEdit, onDelete, onCarryOver }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      aria-label={STATUS_LABEL[status]}
      className={`flex min-h-48 min-w-0 flex-col rounded-2xl border border-[var(--card-border)] p-3 transition-colors ${
        isOver ? "bg-accent/10" : "bg-black/[0.03] dark:bg-white/[0.04]"
      }`}
    >
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className={`h-2 w-2 rounded-full ${DOT[status]}`} />
        {STATUS_LABEL[status]}
        <span className="text-xs font-normal text-muted">{ids.length}</span>
      </h2>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex flex-1 flex-col gap-2">
          {ids.map((id) => {
            const task = tasksById.get(id);
            if (!task) return null;
            return (
              <TaskCard
                key={id}
                task={task}
                planTitle={task.weekly_plan_id ? planTitles.get(task.weekly_plan_id) : undefined}
                onEdit={onEdit}
                onDelete={onDelete}
                onCarryOver={onCarryOver}
              />
            );
          })}
          {ids.length === 0 && <li className="list-none py-6 text-center text-xs text-muted">여기로 끌어다 놓으세요</li>}
        </ul>
      </SortableContext>
    </section>
  );
}
