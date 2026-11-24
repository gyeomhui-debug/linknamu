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

## GitHub 로그인 설정

이 앱은 GitHub 계정으로 로그인해야 쓸 수 있고, 로그인한 사용자는 자기 데이터(1년 목표·주간 계획·할 일)만 볼 수 있습니다.

1. GitHub > Settings > Developer settings > OAuth Apps > **New OAuth App** 에서 앱을 등록합니다.
   - Homepage URL: `http://localhost:3000` (배포 시 배포 주소)
   - **Authorization callback URL**: `http://localhost:3000/auth/github/callback` (배포 시 `https://<도메인>/auth/github/callback`)
2. 만든 앱의 **Client ID** 를 복사하고, **Generate a new client secret** 으로 Client secret 을 발급합니다. (secret 은 한 번만 보입니다)
3. `.env.example` 을 `.env.local` 로 복사해 `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `APP_URL`, `MONGODB_URL` 을 채웁니다. `.env.local` 은 커밋하지 않습니다.
4. 개발 서버를 다시 시작하고 `/login` 에서 GitHub 로 로그인합니다.

| 환경 변수 | 설명 |
|---|---|
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth App 자격증명. 서버에서만 읽고 소스에 넣지 않습니다. |
| `APP_URL` | 앱의 공개 주소(끝 `/` 없이). 콜백 주소 `${APP_URL}/auth/github/callback` 이 OAuth App 에 등록한 값과 **정확히** 같아야 합니다. 개발 환경에서는 없으면 요청의 origin 을 쓰지만, **운영(`NODE_ENV=production`)에서는 필수**입니다(없으면 로그인이 `config` 오류로 막힙니다). |

- 로그인 흐름: `/auth/github`(state 쿠키 발급 → GitHub) → `/auth/github/callback`(state 검증 → 토큰 교환 → 프로필 조회 → 세션 발급). 요청 범위(scope)는 `read:user` 입니다.
- 세션: 서버(MongoDB `sessions`)에 토큰 **해시**만 저장하고, 브라우저에는 httpOnly·SameSite=Lax(운영은 Secure) 쿠키로 7일간 둡니다. 로그아웃(`POST /auth/logout`)하면 서버의 세션 문서를 지우고 쿠키를 만료시킵니다.
- 로그인하지 않은 API 요청은 401, 페이지 요청은 `/login` 으로 리다이렉트됩니다. 남의 데이터 ID 로 요청하면 404 입니다.

### 기존 데이터를 내 계정으로 옮기기 (user_id 마이그레이션)

로그인 도입 전에 만든 1년 목표·주간 계획·할 일에는 `user_id` 가 없습니다. **`user_id` 가 없는 문서는 어떤 사용자에게도 보이지 않습니다**(안전을 위해 기본 거부). 처음 한 번, 내 GitHub 계정으로 로그인해 `users` 에 등록한 뒤 아래 스크립트로 내 것으로 귀속시킵니다.

```bash
npm run migrate:user-id -- --username <GitHub 로그인 이름>           # dry-run: 옮길 건수만 출력 (아무것도 바꾸지 않음)
npm run migrate:user-id -- --username <GitHub 로그인 이름> --apply   # 실제 반영 + user_id 인덱스 생성
```

- `user_id` 가 없는 문서에만 씁니다. 이미 주인이 있는 문서는 건드리지 않고, 여러 번 실행해도 안전합니다(멱등).
- 첫 로그인 사용자에게 자동으로 귀속하지 않습니다. 누구 데이터인지는 직접 정합니다.
- `MONGODB_URL` 은 `.env.local` 에서 읽습니다. 반영 전에 DB 백업(Atlas 스냅샷)을 권장합니다.

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
| `src/lib/auth.ts`, `src/lib/github-oauth.ts` | 세션·사용자 저장소와 `requireUser`, GitHub OAuth 헬퍼 (서버 전용) |
| `src/app/auth/{github,github/callback,logout}`, `src/app/login` | 로그인 시작·콜백·로그아웃 라우트, 로그인 화면 |
| `src/proxy.ts` | 세션 쿠키가 없는 페이지 요청을 `/login` 으로 보내는 낙관적 검사 (실제 인가는 API) |
| `scripts/migrate-user-id.mjs` | 기존 데이터에 `user_id` 귀속 (dry-run 기본) |

## PRD 구현 상태

P0와 P1(1년 목표 진행률 집계, 상태 필터·날짜 이동, 이월, 주간 회고 메모, 터치 드래그)이 모두 구현되어 있습니다.

참고: 이월은 카드 단위 버튼만 제공하며 "지난 미완료 전체 일괄 이월"은 없습니다. 상태 변경 이력(`taskStatusLogs`)은 마지막 변경 시각(`status_changed_at`)만 저장합니다. `PLAN.md`의 "P1 (이번 범위 제외)"는 구현 이전의 계획 기록입니다.
