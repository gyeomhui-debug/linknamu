/** 두 이웃 order 사이에 들어갈 값을 계산. 이웃이 없으면 그쪽 끝으로 확장. */
export function between(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return 1;
  if (prev === null) return (next as number) - 1;
  if (next === null) return prev + 1;
  return (prev + next) / 2;
}

/** 이웃과의 간격이 너무 좁아 재번호가 필요한지 */
export const MIN_GAP = 1e-6;
export function needsRenumber(prev: number | null, next: number | null): boolean {
  return prev !== null && next !== null && next - prev < MIN_GAP;
}
