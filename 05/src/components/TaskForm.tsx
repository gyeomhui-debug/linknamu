"use client";

import { useState } from "react";
import { isWithin } from "@/lib/week";
import { STATUSES, STATUS_LABEL, type Status, type TaskDTO, type WeeklyPlanDTO } from "@/lib/types";

export type TaskFormValues = {
  title: string;
  date: string;
  weekly_plan_id: string | null;
  status?: Status;
};

type Props = {
  /** 있으면 수정, 없으면 생성 */
  task?: TaskDTO;
  defaultDate: string;
  plans: WeeklyPlanDTO[];
  onSubmit: (values: TaskFormValues) => Promise<void>;
  onClose: () => void;
};

export default function TaskForm({ task, defaultDate, plans, onSubmit, onClose }: Props) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [date, setDate] = useState(task?.date ?? defaultDate);
  const [planId, setPlanId] = useState(task?.weekly_plan_id ?? "");
  const [status, setStatus] = useState<Status>(task?.status ?? "todo");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 선택한 날짜를 기간에 포함하는 계획만 연결할 수 있다. 날짜를 바꿔 기간 밖이 되면 선택은 비워진다.
  const available = plans.filter((p) => date && isWithin(date, p.week_start, p.week_end));
  const selectedPlan = available.some((p) => p.id === planId) ? planId : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("제목을 입력해 주세요.");
    if (!date) return setError("날짜를 선택해 주세요.");
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        date,
        weekly_plan_id: selectedPlan || null,
        ...(task ? { status } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다.");
      setSaving(false);
    }
  }

  const field = "w-full rounded-lg border border-[var(--card-border)] bg-white px-3.5 py-3 text-base";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl"
      >
        <h2 className="text-base font-semibold">{task ? "할 일 수정" : "할 일 추가"}</h2>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">제목 *</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={field} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">날짜 *</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">주간 계획 (선택)</span>
          <select value={selectedPlan} onChange={(e) => setPlanId(e.target.value)} className={field}>
            <option value="">연결 안 함</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.week_start} ~ {p.week_end})
              </option>
            ))}
          </select>
          {available.length === 0 && (
            <span className="mt-1 block text-xs text-muted">이 날짜를 포함하는 주간 계획이 없습니다.</span>
          )}
        </label>
        {task && (
          <label className="block text-sm">
            <span className="mb-1 block text-muted">상태</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className={field}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm hover:bg-black/5">
            취소
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
