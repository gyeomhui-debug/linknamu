"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { RETRO_MAX } from "@/lib/retro";
import type { WeeklyPlanDTO } from "@/lib/types";

/** 주간 계획 카드의 회고 메모. 저장은 retrospective 만 PATCH 하므로 진행률·연결은 바뀌지 않는다. */
export default function RetroMemo({ plan, onSaved }: { plan: WeeklyPlanDTO; onSaved: () => Promise<void> }) {
  const [text, setText] = useState(plan.retrospective);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = text.trim() !== plan.retrospective;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/weekly-plans/${plan.id}`, { method: "PATCH", json: { retrospective: text } });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "회고 메모를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      <label className="block text-xs text-muted">
        주간 회고 메모
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={RETRO_MAX}
          rows={3}
          placeholder="이번 주를 돌아보며 잘한 점, 아쉬운 점, 다음 주에 바꿀 점을 적어 보세요."
          className="mt-1 w-full resize-y rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm text-foreground"
        />
      </label>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
        <span className="tabular-nums">
          {text.length}/{RETRO_MAX}
        </span>
        {error && <span className="text-red-600">{error}</span>}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {saving ? "저장 중…" : dirty ? "메모 저장" : "저장됨"}
        </button>
      </div>
    </div>
  );
}
