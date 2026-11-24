"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { WeeklyPlanDTO, YearGoalDTO } from "@/lib/types";
import ConfirmDialog from "./ConfirmDialog";
import ProgressBar from "./ProgressBar";
import { useToast } from "./Toast";

const field = "w-full rounded-lg border border-[var(--card-border)] bg-white px-3.5 py-3 text-base";

function GoalForm({
  goal,
  onSubmit,
  onClose,
}: {
  goal?: YearGoalDTO;
  onSubmit: (v: { year: number; title: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [year, setYear] = useState(String(goal?.year ?? new Date().getFullYear()));
  const [title, setTitle] = useState(goal?.title ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("목표 제목을 입력해 주세요.");
    const y = Number(year);
    if (!Number.isInteger(y)) return setError("연도를 숫자로 입력해 주세요.");
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ year: y, title: title.trim() });
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
        <h2 className="text-base font-semibold">{goal ? "1년 목표 수정" : "1년 목표 추가"}</h2>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">연도 *</span>
          <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className={field} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">목표 제목 *</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={field} />
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

export default function GoalsView() {
  const [goals, setGoals] = useState<YearGoalDTO[]>([]);
  const [plans, setPlans] = useState<WeeklyPlanDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<{ goal?: YearGoalDTO } | null>(null);
  const [deleting, setDeleting] = useState<YearGoalDTO | null>(null);
  const { show, node: toastNode } = useToast();

  const load = useCallback(async () => {
    try {
      const [g, p] = await Promise.all([api<YearGoalDTO[]>("/api/year-goals"), api<WeeklyPlanDTO[]>("/api/weekly-plans")]);
      setGoals(g);
      setPlans(p);
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

  async function save(v: { year: number; title: string }) {
    if (form?.goal) await api(`/api/year-goals/${form.goal.id}`, { method: "PATCH", json: v });
    else await api("/api/year-goals", { method: "POST", json: v });
    setForm(null);
    await load();
  }

  async function unlink(plan: WeeklyPlanDTO) {
    try {
      await api(`/api/weekly-plans/${plan.id}`, { method: "PATCH", json: { year_goal_id: null } });
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : "연결을 해제하지 못했습니다.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const g = deleting;
    setDeleting(null);
    try {
      await api(`/api/year-goals/${g.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : "삭제하지 못했습니다.");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">1년 목표</h1>
        <button onClick={() => setForm({})} className="btn-primary ml-auto">
          + 1년 목표 추가
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
      ) : goals.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">아직 1년 목표가 없습니다. 올해의 목표를 추가해 보세요.</p>
      ) : (
        <ul className="space-y-3">
          {goals.map((g) => {
            const linked = plans.filter((p) => p.year_goal_id === g.id);
            return (
              <li key={g.id} className="rounded-2xl border border-[var(--card-border)] bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted">{g.year}</p>
                    <h2 className="font-semibold">{g.title}</h2>
                  </div>
                  <span className="flex shrink-0 gap-1">
                    <button onClick={() => setForm({ goal: g })} className="rounded px-2 py-1 text-xs text-muted hover:bg-black/5">
                      수정
                    </button>
                    <button onClick={() => setDeleting(g)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-500/10">
                      삭제
                    </button>
                  </span>
                </div>
                <div className="mt-3" role="group" aria-label={`${g.title} 목표 진행률`}>
                  <p className="mb-1 text-xs text-muted">
                    목표 진행률 · 연결된 주간 계획 {linked.length}개 평균
                  </p>
                  <ProgressBar value={g.progress} />
                </div>
                <div className="mt-3 space-y-3 border-t border-[var(--card-border)] pt-3">
                  {linked.length === 0 ? (
                    <p className="text-xs text-muted">연결된 주간 계획이 없습니다. 주간 계획 화면에서 이 목표에 연결하세요.</p>
                  ) : (
                    linked.map((p) => (
                      <div key={p.id}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate">
                            {p.title} <span className="text-xs text-muted">({p.week_start} ~ {p.week_end})</span>
                          </span>
                          <button onClick={() => unlink(p)} className="shrink-0 rounded px-2 py-1 text-xs text-muted hover:bg-black/5">
                            연결 해제
                          </button>
                        </div>
                        <ProgressBar value={p.progress} />
                      </div>
                    ))
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {form && <GoalForm goal={form.goal} onSubmit={save} onClose={() => setForm(null)} />}
      {deleting && (
        <ConfirmDialog
          title="이 1년 목표를 삭제할까요?"
          description={`“${deleting.title}” — 연결된 주간 계획은 삭제되지 않고 연결만 해제됩니다.`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
      {toastNode}
    </main>
  );
}
