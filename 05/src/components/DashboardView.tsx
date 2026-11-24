"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { averageProgress, currentPlans, goalsOfYear, summarizeTasks } from "@/lib/dashboard";
import { STATUSES, STATUS_LABEL, type TaskDTO, type WeeklyPlanDTO, type YearGoalDTO } from "@/lib/types";
import { todayString } from "@/lib/week";
import ProgressBar from "./ProgressBar";

type Data = { goals: YearGoalDTO[]; plans: WeeklyPlanDTO[]; tasks: TaskDTO[] };

const card = "rounded-2xl border border-[var(--card-border)] bg-card p-4";

function Section({ title, sub, href, linkLabel, children }: { title: string; sub: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <section className={card}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted">{sub}</p>
        </div>
        <Link href={href} className="shrink-0 text-xs text-accent hover:underline">
          {linkLabel}
        </Link>
      </div>
      {children}
    </section>
  );
}

export default function DashboardView() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 서버/클라이언트 날짜 불일치를 피하려고 마운트 후에 오늘을 정한다.
  const [today, setToday] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = todayString();
    try {
      const [goals, plans, tasks] = await Promise.all([
        api<YearGoalDTO[]>("/api/year-goals"),
        api<WeeklyPlanDTO[]>("/api/weekly-plans"),
        api<TaskDTO[]>(`/api/tasks?date=${t}`),
      ]);
      setToday(t);
      setData({ goals, plans, tasks });
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    // 마운트 시 API 데이터 동기화 — 정당한 effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-baseline gap-2">
        <h1 className="text-lg font-bold">대시보드</h1>
        {today && <span className="text-xs text-muted">{today} 기준</span>}
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-red-300 p-6 text-center text-sm">
          <p className="mb-3 text-red-600">{loadError}</p>
          <button onClick={load} className="rounded-lg border border-[var(--card-border)] px-3 py-1.5">
            다시 시도
          </button>
        </div>
      ) : !data || !today ? (
        <p className="py-16 text-center text-sm text-muted">불러오는 중…</p>
      ) : (
        <Body data={data} today={today} />
      )}
    </main>
  );
}

function Body({ data, today }: { data: Data; today: string }) {
  const year = Number(today.slice(0, 4));
  const goals = goalsOfYear(data.goals, year);
  const plans = currentPlans(data.plans, today);
  const day = summarizeTasks(data.tasks);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Section title="연간" sub={`${year}년 목표 ${goals.length}개`} href="/goals" linkLabel="1년 목표 →">
        {goals.length === 0 ? (
          <p className="text-sm text-muted">올해 목표가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-muted">전체 평균</p>
              <ProgressBar value={averageProgress(goals)} />
            </div>
            <ul className="space-y-2 border-t border-[var(--card-border)] pt-3">
              {goals.map((g) => (
                <li key={g.id}>
                  <p className="mb-1 truncate text-sm">{g.title}</p>
                  <ProgressBar value={g.progress} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="주간" sub="이번 주 계획" href="/weeks" linkLabel="주간 계획 →">
        {plans.length === 0 ? (
          <p className="text-sm text-muted">이번 주에 해당하는 계획이 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {plans.map((p) => (
              <li key={p.id}>
                <p className="mb-1 truncate text-sm">
                  {p.title} <span className="text-xs text-muted">({p.week_start} ~ {p.week_end})</span>
                </p>
                <ProgressBar value={p.progress} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="일간" sub="오늘 할 일" href={`/?date=${today}`} linkLabel="일일 보드 →">
        {day.total === 0 ? (
          <p className="text-sm text-muted">오늘 등록된 할 일이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            <ProgressBar value={day.progress} />
            <dl className="grid grid-cols-3 gap-2 text-center">
              {STATUSES.map((s) => (
                <div key={s} className="rounded-lg bg-black/5 py-2 dark:bg-white/10">
                  <dd className="text-lg font-semibold tabular-nums">{day.counts[s]}</dd>
                  <dt className="text-xs text-muted">{STATUS_LABEL[s]}</dt>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Section>
    </div>
  );
}
