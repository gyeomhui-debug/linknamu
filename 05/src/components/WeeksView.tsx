"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { WeeklyPlanDTO, YearGoalDTO } from "@/lib/types";
import { addDays, todayString, weekRange } from "@/lib/week";
import ConfirmDialog from "./ConfirmDialog";
import ProgressBar from "./ProgressBar";
import RetroMemo from "./RetroMemo";
import { useToast } from "./Toast";

const field = "w-full rounded-lg border border-[var(--card-border)] bg-white px-3.5 py-3 text-base";

type FormValues = { title: string; week_start: string; week_end: string; year_goal_id: string | null };

function PlanForm({
  plan,
  goals,
  onSubmit,
  onClose,
}: {
  plan?: WeeklyPlanDTO;
  goals: YearGoalDTO[];
  onSubmit: (v: FormValues) => Promise<void>;
  onClose: () => void;
}) {
  const init = weekRange(todayString());
  const [title, setTitle] = useState(plan?.title ?? "");
  const [start, setStart] = useState(plan?.week_start ?? init.week_start);
  const [end, setEnd] = useState(plan?.week_end ?? init.week_end);
  const [goalId, setGoalId] = useState(plan?.year_goal_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("계획 제목을 입력해 주세요.");
    if (!start || !end) return setError("시작일과 종료일을 선택해 주세요.");
    if (end < start) return setError("종료일은 시작일보다 빠를 수 없습니다.");
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim(), week_start: start, week_end: end, year_goal_id: goalId || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl"
      >
        <h2 className="text-base font-semibold">{plan ? "주간 계획 수정" : "주간 계획 추가"}</h2>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">제목 *</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={field} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">시작일 *</span>
            <input
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (e.target.value && !plan) setEnd(addDays(e.target.value, 6));
              }}
              className={field}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">종료일 *</span>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={field} />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">1년 목표 (선택)</span>
          <select value={goalId} onChange={(e) => setGoalId(e.target.value)} className={field}>
            <option value="">연결 안 함</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.year} · {g.title}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm hover:bg-black/5">
            취소
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function WeeksView() {
  const [plans, setPlans] = useState<WeeklyPlanDTO[]>([]);
  const [goals, setGoals] = useState<YearGoalDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<{ plan?: WeeklyPlanDTO } | null>(null);
  const [deleting, setDeleting] = useState<WeeklyPlanDTO | null>(null);
  const { show, node: toastNode } = useToast();

  const load = useCallback(async () => {
    try {
      const [p, g] = await Promise.all([api<WeeklyPlanDTO[]>("/api/weekly-plans"), api<YearGoalDTO[]>("/api/year-goals")]);
      setPlans(p);
      setGoals(g);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 마운트 시 API 데이터 동기화 — 정당한 effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function save(v: FormValues) {
    if (form?.plan) await api(`/api/weekly-plans/${form.plan.id}`, { method: "PATCH", json: v });
    else await api("/api/weekly-plans", { method: "POST", json: v });
    setForm(null);
    await load();
  }

  async function changeGoal(plan: WeeklyPlanDTO, goalId: string) {
    try {
      await api(`/api/weekly-plans/${plan.id}`, { method: "PATCH", json: { year_goal_id: goalId || null } });
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : "연결을 변경하지 못했습니다.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const p = deleting;
    setDeleting(null);
    try {
      await api(`/api/weekly-plans/${p.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : "삭제하지 못했습니다.");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">주간 계획</h1>
        <button onClick={() => setForm({})} className="btn-primary ml-auto">
          + 주간 계획 추가
        </button>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-red-300 p-6 text-center text-sm">
          <p className="mb-3 text-red-600">{loadError}</p>
          <button onClick={load} className="rounded-lg border border-[var(--card-border)] px-3 py-1.5">
            다시 시도
          </button>
        </div>
      ) : loading ? (
        <p className="py-16 text-center text-sm text-muted">불러오는 중…</p>
      ) : plans.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">아직 주간 계획이 없습니다. 첫 계획을 추가해 보세요.</p>
      ) : (
        <ul className="space-y-3">
          {plans.map((p) => (
            <li key={p.id} className="rounded-2xl border border-[var(--card-border)] bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{p.title}</h2>
                  <p className="text-xs text-muted">
                    {p.week_start} ~ {p.week_end}
                  </p>
                </div>
                <span className="flex shrink-0 gap-1">
                  <button onClick={() => setForm({ plan: p })} className="rounded px-2 py-1 text-xs text-muted hover:bg-black/5">
                    수정
                  </button>
                  <button onClick={() => setDeleting(p)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-500/10">
                    삭제
                  </button>
                </span>
              </div>
              <div className="mt-3">
                <ProgressBar value={p.progress} />
              </div>
              <label className="mt-3 block text-xs text-muted">
                1년 목표
                <select
                  value={p.year_goal_id ?? ""}
                  onChange={(e) => changeGoal(p, e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] bg-white px-2.5 py-2 text-sm text-foreground"
                  aria-label={`${p.title}에 연결할 1년 목표`}
                >
                  <option value="">연결 안 함</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.year} · {g.title}
                    </option>
                  ))}
                </select>
              </label>
              <RetroMemo plan={p} onSaved={load} />
            </li>
          ))}
        </ul>
      )}

      {form && <PlanForm plan={form.plan} goals={goals} onSubmit={save} onClose={() => setForm(null)} />}
      {deleting && (
        <ConfirmDialog
          title="이 주간 계획을 삭제할까요?"
          description={`“${deleting.title}” — 연결된 할 일은 삭제되지 않고 연결만 해제됩니다.`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
      {toastNode}
    </main>
  );
}
