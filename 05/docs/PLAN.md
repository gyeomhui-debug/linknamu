# 할 일 관리 앱 구현 계획 (PRD 기반)

상태: **승인됨** — M0부터 순서대로 구현 중.

## Context
`05/docs/PRD.md`는 일일 할 일을 주간 계획과 1년 목표에 연결하고, 칸반 보드(todo/doing/done)에서 드래그 앤 드롭으로 상태를 바꾸면 주간 진행률이 자동 계산되는 개인용 앱을 정의한다. 현재 저장소(`C:\Users\GH\linknamu`)는 링크나무(Next.js 16 + Tailwind 4 + MongoDB) 프로젝트이고 `05/`에는 `docs/PRD.md`만 있다. 결정 사항: **`05/` 폴더에 별도 Next.js 앱으로 생성**, 저장소는 **MongoDB Atlas**, 로그인 없는 **단일 사용자** 앱(PRD 모델에 user 필드 없음).

## 기술 결정
| 항목 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | Next.js 16 App Router + TypeScript + Tailwind 4 | 루트 프로젝트와 동일 버전 |
| DB | MongoDB Atlas, 별도 DB `todo` | 루트 `src/lib/mongodb.ts`의 전역 클라이언트 캐시 패턴 재사용(복사) |
| 드래그 앤 드롭 | `@dnd-kit/core` + `@dnd-kit/sortable` | 터치 센서 내장 → P1 모바일 지원 확장이 쉬움 |
| 순서(order) | 숫자 + 이웃 값 중간값 방식 | 드롭 한 번에 문서 1건만 갱신 |
| 테스트 | Vitest(순수 함수) + 수동 E2E | 진행률·순서 계산이 핵심 위험 지점 |

> 주의: `AGENTS.md`에 "이 Next.js는 알던 것과 다르다"는 경고가 있다. 구현 전 `node_modules/next/dist/docs/`에서 라우트 핸들러·`params`·클라이언트 컴포넌트 규칙을 읽는다.

## 디렉터리 구조 (`05/`)
```
05/
  docs/PRD.md, PLAN.md
  .env.local                  # MONGODB_URL (커밋 금지)
  src/lib/mongodb.ts, models.ts, progress.ts, order.ts, week.ts
  src/app/api/year-goals|weekly-plans|tasks/route.ts, [id]/route.ts
  src/app/page.tsx            # 일일 보드 (?date=YYYY-MM-DD)
  src/app/weeks/page.tsx      # 주간 계획 + 진행률
  src/app/goals/page.tsx      # 1년 목표 + 연결된 주간 계획
  src/components/             # Board, Column, TaskCard, TaskForm, WeeklyPlanCard, GoalCard, ConfirmDialog, Toast
```

## 데이터 모델
- `yearGoals`: `_id, year, title`
- `weeklyPlans`: `_id, year_goal_id|null, week_start, week_end, title, progress(0–100 정수)`
- `tasks`: `_id, weekly_plan_id|null, date, title, status('todo'|'doing'|'done'), order, updated_at, status_changed_at`
  - `updated_at`: 어떤 필드든 바뀌면 갱신
  - `status_changed_at`: **status가 실제로 바뀔 때만** 갱신 (생성 시에는 생성 시각). PRD의 "상태 변경 시각 기록"은 이 필드가 담당
- 인덱스: `tasks {date,status,order}`, `tasks {weekly_plan_id}`, `weeklyPlans {year_goal_id}`

## 핵심 로직
1. **진행률(저장 + 전체 재계산)**: `total === 0 ? 0 : Math.round(done / total * 100)`. `weeklyPlans.progress`에 저장하되 증분 갱신은 쓰지 않고, 영향받는 계획의 연결된 할 일을 매번 다시 세어 덮어쓴다.
   - **재계산 대상**: 할 일 생성·수정·삭제·상태변경 시 해당 계획. **다른 계획으로 옮기거나 연결을 해제하면 이전 계획과 새 계획 둘 다** 재계산한다 (이전 계획만 빠뜨리는 누락 방지).
   - **트랜잭션**: 재계산은 매번 전체 카운트라 멱등이므로 일시적 불일치가 생겨도 다음 쓰기에서 복구된다. 단일 사용자 앱이라 다중 문서 트랜잭션은 쓰지 않고, 이전·새 계획 재계산을 같은 요청 안에서 모두 끝낸다. 동시 사용자가 생기면 트랜잭션 또는 조회 시 계산으로 전환한다.
   - **대안(기각)**: 조회 시 계산하면 저장 필드가 필요 없지만, PRD 데이터 모델이 `progress`를 필드로 명시하고 1년 목표 집계(P1)에서 재사용하기 쉬워 저장 방식을 유지.
2. **날짜–기간 정합성 (P0 규칙)**: 할 일은 `week_start ≤ task.date ≤ week_end`인 주간 계획에만 연결할 수 있다. **기간 밖이면 연결을 막고 400**을 돌려준다 (자동 해제는 쓰지 않음 — 사용자가 모르는 사이 연결이 사라지는 것을 방지).
   - 적용 시점: 할 일 생성, 계획 연결·변경, **날짜 수정**(연결된 계획의 기간을 벗어나면 400, 먼저 연결을 해제하거나 바꿔야 함), **주간 계획의 기간 수정**(이미 연결된 할 일이 기간 밖으로 나가게 되면 400).
   - 오류 메시지 예: "할 일 날짜가 주간 계획 기간(2026-11-23 ~ 2026-11-29) 밖입니다."
   - UI: 할 일 폼의 주간 계획 선택지는 선택한 날짜를 포함하는 계획만 보여 준다.
3. **삭제 시 연결 해제**: 1년 목표 삭제 → 소속 주간 계획의 `year_goal_id=null`; 주간 계획 삭제 → 소속 할 일의 `weekly_plan_id=null`. 하위 데이터 유지.
4. **상태 변경**: `PATCH /api/tasks/[id]`. 모든 쓰기에서 `updated_at` 갱신, **`status`가 이전 값과 다를 때만 `status_changed_at` 갱신**(제목·날짜·순서만 바뀌면 유지). 생성 기본 status=`todo`. 카드에는 `status_changed_at`을 표시한다.
5. **상태 변경 이력(P1)**: 주간 회고에서 "언제 doing→done 됐는지"가 필요해지면 `taskStatusLogs {task_id, from, to, changed_at}` 컬렉션을 추가하고 상태가 바뀔 때 1건씩 기록한다. P0에서는 마지막 변경 시각(`status_changed_at`)만 둔다.
6. **DnD**: 컬럼 간 이동 → status+order, 같은 컬럼 → order만(`status_changed_at` 불변). 낙관적 UI, 실패 시 스냅샷 복원 + 토스트.
7. **입력 검증**: 빈 제목 400, 날짜 `YYYY-MM-DD`, status 화이트리스트, 존재하지 않는 weekly_plan_id 400, 날짜가 계획 기간 밖이면 400.

## 구현 단계
| 단계 | 내용 | 완료 기준 |
|---|---|---|
| M0 스캐폴드 | `05/`에 Next 16 앱, 의존성, `.env.local`, 루트 tsconfig/eslint에서 `05` 제외 | `05`·루트 `npm run build` 모두 성공 |
| M1 데이터·API | mongodb/models/progress/order/week + 단위 테스트, 3개 리소스 CRUD, 연결 해제 | curl 검증, 단위 테스트 통과 |
| M2 할 일 CRUD UI | 날짜별 목록, 생성·수정·삭제 확인 | 흐름 동작, 삭제 후 진행률 갱신 |
| M3 칸반 + DnD | 3컬럼 보드, 낙관적 업데이트/롤백 | 새로고침 후 유지, 실패 시 원위치 |
| M4 주간·1년 화면 | 계획 CRUD, 연결/해제/변경, 진행률 바 | User Flow 1~7 수행 가능 |
| M5 마감 | 빈 상태·에러·로딩, 반응형, README | 375px에서 가로 스크롤 없음 |

## P1 (이번 범위 제외)
1년 목표 진행률 집계, 상태 필터·날짜 이동, 이월(기간이 다른 주로 넘어가면 연결 해제 또는 새 주 계획 선택 필요 — 위 정합성 규칙 적용), 주간 회고 메모와 상태 변경 이력, 모바일 터치 상태 변경.

## 위험과 대응
| 위험 | 대응 |
|---|---|
| 루트 빌드가 `05/`를 끌어들임 | 루트 `tsconfig.json` exclude에 `05` 추가, 루트 빌드로 회귀 확인 |
| Next 16 변경점(params 등) | 번들 docs 확인, 라우트 1개로 먼저 검증 |
| 진행률 불일치 | 증분 갱신 대신 매번 count로 재계산, 계획 이동·해제 시 이전·새 계획 모두 재계산 |
| 기간 밖 할 일이 진행률을 왜곡 | 연결·날짜 수정·기간 수정 모두에서 `week_start ≤ date ≤ week_end` 검증 후 400 |
| 제목 수정이 상태 변경 시각을 덮어씀 | `status_changed_at`을 `updated_at`과 분리, status 값이 달라질 때만 갱신 |
| 순서 중간값 정밀도 소진 | 간격 임계값 미만이면 컬럼 재번호 |
| 드롭 실패 후 불일치 | 스냅샷 복원 + 토스트 |
| Atlas 비밀번호 노출 | `.env.local`만 사용, 커밋 전 `git status` 확인 |

## 검증
- 단위(Vitest): `calcProgress`, `between`, `week`.
- API(curl): 기본 status, 진행률 재계산, 연결 해제, 400 처리.
  - 정합성: 기간 밖 날짜로 생성·연결 → 400 / 연결된 할 일의 날짜를 기간 밖으로 수정 → 400 / 연결된 할 일이 있는 계획의 기간을 줄여 밖으로 나가게 → 400 / 기간 안이면 성공.
  - 진행률: 할 일을 계획 A→B로 옮기면 A와 B의 `progress`가 모두 바뀐다.
  - 시각: 제목·날짜만 수정하면 `status_changed_at` 불변·`updated_at`만 변경, 상태를 바꾸면 둘 다 변경, 같은 컬럼 내 순서 변경은 `status_changed_at` 불변.
- E2E(수동): User Flow 1→7, 새로고침 유지, 서버 중단 후 드롭 롤백.
- 회귀: 루트 `npm run build` / `npm run lint`.
