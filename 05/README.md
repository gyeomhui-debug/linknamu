# 할 일 플래너

일일 할 일을 주간 계획과 1년 목표에 연결해 관리하는 앱입니다. 기획은 [`docs/PRD.md`](docs/PRD.md), 구현 계획은 [`docs/PLAN.md`](docs/PLAN.md)를 참고하세요.

- 일일 보드: 할 일을 todo / doing / done 컬럼에서 드래그 앤 드롭으로 옮기면 상태가 바뀌고 주간 진행률이 즉시 갱신됩니다.
- 주간 계획: 기간별 계획과 진행률(`done ÷ 연결된 전체 × 100`), 1년 목표 연결·변경·해제.
- 1년 목표: 연결된 주간 계획과 진행률 확인.
- 상위 항목을 삭제하면 하위 항목은 지워지지 않고 연결만 해제됩니다.
- 1년 목표 진행률: 연결된 주간 계획 진행률의 평균(반올림)을 목표 카드에 표시합니다. 연결된 계획이 없으면 0%.
- 상태 필터: 일일 보드 위의 탭(전체/할 일/진행 중/완료)으로 컬럼을 걸러 봅니다. `/?date=YYYY-MM-DD&status=doing`처럼 URL에 유지되고, 잘못된 값은 "전체"로 처리됩니다.
- 이월: 미완료(todo/doing) 카드의 "내일로 / 다음 주로" 버튼으로 날짜를 +1일 / +7일 옮깁니다. 연결된 주간 계획 기간을 벗어나면 막고 안내하며(연결을 자동으로 해제하지 않음), 상태와 상태 변경 시각은 유지됩니다.
- 주간 회고 메모: 주간 계획 카드에서 최대 2000자 메모를 저장합니다. 메모 저장은 진행률·연결에 영향을 주지 않습니다.

## 실행

```bash
cd 05
npm install
# .env.local 에 MONGODB_URL=<Atlas 연결 문자열> 설정 (커밋 금지). 데이터는 `todo` DB에 저장됩니다.
npm run dev      # http://localhost:3000
npm test         # 진행률·순서·주 계산 단위 테스트
npm run lint && npm run build
```

## 구조

| 경로 | 역할 |
|---|---|
| `src/app/page.tsx` | 일일 보드 (`/?date=YYYY-MM-DD`) |
| `src/app/weeks`, `src/app/goals` | 주간 계획, 1년 목표 화면 |
| `src/app/api/{tasks,weekly-plans,year-goals}` | REST API |
| `src/lib/progress.ts` | 주간 진행률 재계산, 1년 목표 진행률 집계 |
| `src/lib/filter.ts`, `carryover.ts`, `retro.ts` | 상태 필터 파싱·URL, 이월 날짜 규칙, 회고 메모 검증 (순수 함수) |
| `src/lib/order.ts` | 카드 순서(이웃 값 중간값) |
| `src/lib/types.ts` | 클라이언트·서버 공용 타입 (mongodb 미포함) |

## PRD 구현 상태

P0와 P1(1년 목표 진행률 집계, 상태 필터·날짜 이동, 이월, 주간 회고 메모, 터치 드래그)이 모두 구현되어 있습니다.

참고: 이월은 카드 단위 버튼만 제공하며 "지난 미완료 전체 일괄 이월"은 없습니다. 상태 변경 이력(`taskStatusLogs`)은 마지막 변경 시각(`status_changed_at`)만 저장합니다. `PLAN.md`의 "P1 (이번 범위 제외)"는 구현 이전의 계획 기록입니다.
