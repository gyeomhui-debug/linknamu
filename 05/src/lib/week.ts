const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD 형식이면서 실제로 존재하는 날짜인지 */
export function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** start ≤ date ≤ end (모두 YYYY-MM-DD라 문자열 비교로 충분) */
export function isWithin(date: string, start: string, end: string): boolean {
  return start <= date && date <= end;
}

export function rangeMessage(start: string, end: string): string {
  return `할 일 날짜가 주간 계획 기간(${start} ~ ${end}) 밖입니다.`;
}

export function addDays(s: string, days: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 해당 날짜가 속한 주(월~일)의 시작·종료일 */
export function weekRange(s: string): { week_start: string; week_end: string } {
  const day = new Date(`${s}T00:00:00Z`).getUTCDay(); // 0=일
  const offset = day === 0 ? -6 : 1 - day;
  const week_start = addDays(s, offset);
  return { week_start, week_end: addDays(week_start, 6) };
}

/** 로컬 시간대 기준 오늘 날짜 (YYYY-MM-DD) */
export function todayString(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
