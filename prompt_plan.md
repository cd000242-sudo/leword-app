# 끝판왕 프로그램 진행 상태 (2026-07-09 세션 체크포인트)

> 마스터플랜 메모리: **project_kkeutpanwang_program** (C1~C5 뿌리결함 + 실행순서)
> 브랜치 스택(로컬, 미머지·미푸시): `refactor/grade-ssot`(C1) ← `feat/c2-serp-signal-revival`(C2+C4). 현재 브랜치 = 후자.
> 매 슬라이스 verify:all exit 0. 다음 세션은 아래 "다음 착수"부터.

## 완료
- **C1 등급 SSoT 단일화** ✅ — grade.ts 단일 엔진, 진짜 중복 6곳(mdp/radar/mindmap/floor/direct-golden/pc-engine) 위임. 624d05e4→0cca805c.
- **C2 SERP 신호 부활** ✅ — phase1(죽은 문자열매칭 제거+정직화 8bcbdb16), phase2a/2b(실측 SERP 어댑터+상위N puppeteer 심층 82711e09/83947264), on-demand 배선+graceful-degrade 3중방어(0a71c5d4).
- **C4 엔진 승격** ✅ (3종, keyword-discovery 반환 map에 표시용 부가필드 불변주석, 코어 등급/score/필터 미변경):
  - slice1 keyword-value-verifier(순수, 전항목 valueGrade/qualityScore) 7f32e582
  - slice2 vacancy-detector(axios, chrome불필요, 상위10 vacancySlots) ee67b0f5
  - slice3 serp-content-analyzer(puppeteer 본문크롤, 상위3 실측 브리핑) f42c693e
  - **win-predictor는 미승격**(예상순위/트래픽 추정치=UI금지 규칙 위반). wiring-regression으로 고정.
- **C4 web 이식** ✅ — pro-web-site renderGoldenRows에 Pro(exact) 조건부 실측 배지(가치게이트/실측 SERP 진입/빈집/권장분량). **이전 체크포인트의 "서버 payload엔 이미 실림"은 오판**: ① 라다(direct-golden-keyword-miner) 발굴은 C2/C4 필드 미생산, ② API 컨테이너 loadBoardFromFile이 명시 필드만 복원해 부가필드 소실. 조치: contracts에 실측 부가필드 optional 추가 + loadBoardFromFile 화이트리스트 보존(추정치 필드 부활 차단) + snapshot() 시점 valueGrade 순수 계산(실측·비추정 행만) → valueGrade는 배포 즉시 실동작. 회귀: mobile-live-golden-radar.test에 왕복보존/부활차단/valueGrade 3 assert.

- **Desktop→Server ingest (대량·안정 공급)** ✅ (승인 후 구현): ① radar.ingestBoard — 실측 출처·비추정 명시 행만 수용, board 파일/inbox 공용 복원 경로(boardItemFromPersistedRow)로 SSoT 재검증. ② 쓰기 소유 분리: ingest 는 `{boardFile}-ingest.json` inbox 에만 기록(워커가 board 파일 소유, API readonly 5초 새로고침과 충돌 없음), loadBoardFromFile 이 board+inbox 병합(신선한 쪽 우선, board 파일 없어도 inbox 병합). ③ POST /v1/live-golden/ingest — `LEWORD_LIVE_GOLDEN_INGEST_TOKEN` 미설정=503(기능 꺼짐), 상수시간 비교, 512KB 한도. ④ 데스크톱 push: live-board-uploader(env URL+TOKEN 둘 다 있어야 동작 — 일반 배포판 무동작), MDP 발굴 완료 후 fire-and-forget, SearchAd 분리검색량+실측 문서수 행만(direct-golden miner 에 pc/mobile passthrough 추가, MDPResult 에 optional 선언). ⑤ 프리뷰 품질: publicPreviewQualityScore 에 valueGrade S+/S 가점·C 감점·winnable false 강등, 라벨 "하위 5개 공개"→"실측 검증 5선 공개" 정직화. 서버측 vacancy/brief 생산 없이도 데스크톱 push 로 C4 배지 필드가 웹에 도달.

## 다음 착수
1. ~~배포~~ ✅ (2026-07-09 Codex 완료): Vultr 재배포(f2602954) + ingest 토큰 설정 + 검증 a~f 전부 통과. 운영자 PC `%APPDATA%\blogger-gpt-cli\.env` 에 ingest URL/TOKEN 설정 완료(`https://141.164.59.17.sslip.io/v1/live-golden/ingest`), 이 PC→서버 인증 왕복 200 ok 확인. **주의**: EnvironmentManager 는 .env 를 process.env 로 주입하지 않아 ingest 2키 화이트리스트 주입 추가. **함정 기록**: `src/utils/*.js` 에 2025-11 낡은 in-place 컴파일 산출물이 남아 있어 ts-node require 시 .ts 대신 stale .js 가 로드될 수 있음(environment-manager 에서 실제 발생, dist 는 정상) — 정리 후보.
   - **남은 마지막 단계**: 데스크톱 앱을 이 레포에서 `npm run start` 로 실행(설치본엔 업로더 코드 없음) → 황금키워드 발굴 1회 → `[LIVE-BOARD-UPLOAD] N개 전송, 서버 수용 M개` 로그 확인 → 웹 보드 채움 확인.
1-a. **🔥 실시간 급등 레인** ✅ (ce86ea98, 승인 후 구현): 트렌딩 헤드(정보형 시드 필터 이전 원문 lastRawLiveSeeds) → 자동완성 확장(사람이 치는 형태만) → SearchAd+문서수 실측 → 기회지수 게이트(sv≥3k·dc≤30k·비율≥10·48h·최소 브랜드세이프티) → lane='traffic-surge'. 정보형 게이트(lookup/프로필/50만 상한/글감의도/판정강등) 미적용 — 6개 관문 lane escape. 웹 '🔥 실시간 급등' 탭(기회지수 정렬). 근거: 경쟁 툴 키워드 10개 중 8개를 기존 게이트가 차단함을 실증. Phase 2 ✅ (3feb5985): SurgeEmergenceTracker 스냅샷 diff — 신규 진입 fresh 우선 실측 + 상위 3개 2차 확장 + surgeNewEntry(48h) 태그 + 웹 🔥/🆕 배지. 콜드스타트 기준선은 태깅 제외(baseline 플래그). Phase 3 후보: 헤드 소스 확장(방송편성/신제품 크롤).
1-b. **재배포 대기(ce86ea98)**: 라이브 보드 품질 3종 미반영 상태 — ① 카테고리 탭(4e8a4269) ② 정치이벤트×수급tail 의미충돌 차단(341cde98) ③ **실수요 증명 게이트**(5d24a094, 승인됨): 프로브/캐시 출신 행을 자동완성 실측(echo/extension)으로 검증해 유령('단백질보충제순위준비물' 류) 제거·승격 차단. opt-in — factory 만 실프로브 주입, env LEWORD_MOBILE_LIVE_GOLDEN_REALDEMAND=false 로 비활성. Codex 에 "main(3feb5985) pull 후 재빌드·재기동, env 변경 없음" 전달 — 급등 레인 포함 4종 반영. 배포 후 워커 사이클마다 'N ghost-removed' 로그로 기존 보드 청소 진행 확인.
2. **서버측 vacancy/brief/serp 자체 생산(선택)**: 데스크톱 push 로 대체 공급되므로 우선순위 하락. 워커 배선 시 Vultr IP 429 리스크(brief 는 chrome 필요) 재평가 후 결정.
3. **win-predictor(미래)**: 블로그 등록 UX(user-profile measureBlog) 선행 → 등록 사용자에게만 개인화 예측, UI 미노출 원칙(내부 정렬 보조 정도).
4. 마스터플랜 순서: C3(추정치 실측/라벨) → C5(상위후보 실LLM) → 파리티.

## UI 노출 시 주의 (feedback_no_estimates_in_ui)
승격된 부가필드 중 **실측·사실만 노출 가능**: valueGrade(게이트 통과율), vacancySlots(실측 빈슬롯), briefRecommendedWords/briefMustInclude(경쟁사 실측), winnable(블록 실측). **추정치(예상순위/트래픽/수익/친화도점수) 노출 금지.**

## 신규 특성화 오라클(전부 sanity 게이트 등록됨)
grade-characterization 66/0, serp-difficulty-adapter 21/0, deep-serp-enricher 18/0, serp-deep-wiring-regression 26/0, keyword-value-verifier 26/0, vacancy-enricher 14/0, content-brief-enricher 13/0.

---

# (참고) C1 등급 SSoT 단일화 상세 — ✅ 완료

> 작성일: 2026-07-09 · 상태: **완료** (verify:all exit 0, 모든 테스트 통과)
> 브랜치 refactor/grade-ssot · 마스터플랜 메모리 project_kkeutpanwang_program

## 요구사항
회귀 근본원인 = 등급 정의 4곳(mdp/floor/radar/mindmap)+~29 인라인 파편화. 단일 SSoT `src/utils/grade.ts`로 통일 → 회귀 정지 + 저볼륨 winnable을 SSS 정본화. **모든 테스트 통과**로 완료.

## 완료 내역 (커밋 순)
- **624d05e4** slice1: grade.ts SSoT + floor 3함수 위임(무동작변경) + 특성화 오라클 66/66.
- **f6fa647e** slice2-3: mdp calculateGrade → classifyGrade(SSS classic→classic OR winnable) · radar normalizeGrade → normalizeStoredGrade(점수-only 가짜 SSS 차단, D→C 클램프).
- **764069df** slice4a: mindmap calculateMindmapMetricGrade → classifyGradeByMetrics(winnable SSS 통일).
- **32d39ce6** slice4b: direct-golden gradeFromMetrics → classifyGrade · pc-engine normalizeGrade → normalizeStoredGrade.

## 인라인 감사 결론 (Explore 팬아웃 판정)
- **위임한 진짜 중복 6곳**: mdp/radar/mindmap/floor(slice1) + direct-golden/pc-engine(slice4b). 임계값이 SSoT와 완전 일치하던 사다리.
- **의도적으로 남긴 사이트**: pro-traffic `determineGrade`·ultimate `targetGradeU`·pro-traffic `targetGradeM`(profit/monetization **blended 점수** 기반 — SSoT raw-score 임계값과 의미 불일치, 위임 시 미스캘리브레이션 + 'SSS 대량 보장' 회귀), `computePremiumGrade`(카테고리별)·rich-feed `calculateGrade`·profit-engine(도메인 고유 지표 래더). 등급 **소비** 코드(비교/필터/카운트)는 대상 아님.

## 최종 검증 (2026-07-09)
verify:all exit 0 — build+lint:sss+sanity+verify:mobile+health:sanity 전부 그린.
핵심 밴드 회귀 없음: golden-category-sss-100run 1102/0 · pro-traffic-sss-100run 513/0 · home-hunter-splus-floor 414/0 · mindmap-metrics-regression 10/0 · grade-characterization 66/0 · health:sanity 22/0.

## 범위 밖(다음 /plan): C2 SERP · C4 win-predictor · C3 추정치 · C5 LLM · 파리티.

---

## 이전 계획

# LEWORD 모바일 PC 기능 완전 연동 계획

> 작성일: 2026-06-06
> 상태: **진행 중**
> 목표: 모바일 앱에서 PC 기능을 숨기지 않고 서브탭별로 정리한 뒤, 실행 가능한 기능부터 PC 엔진 API로 하나씩 연결하고 테스트한다.

## 요구사항 정리

- 기존 PC 앱 favicon(`assets/256.ico`)을 모바일 앱 로고/스플래시 자산으로 사용한다.
- 모바일 첫 화면은 간단하고 직관적으로 유지하되, 좌측 서브탭으로 PC 기능 전체를 정리한다.
- 모바일과 PC는 별도 설정으로 분리하지 않고, 패널 로그인/PC API 서버 기준으로 자동 연동한다.
- 실시간 검색어, 정책 브리핑, 오늘 이슈, 추천 인박스는 앱 첫 흐름에서 바로 보여야 한다.
- PC 기능 parity는 버튼만 복사하는 것이 아니라 모바일 → API → PC 엔진/핸들러 → 결과 표시 → 테스트까지 검증한다.

## 단계별 실행

1. **로고 통일**
   - `assets/256.ico`에서 PNG favicon 원본 추출
   - `apps/mobile/assets/icon.png`, `adaptive-icon.png`, `splash.png` 재생성
   - Expo asset gate와 APK 빌드로 확인

2. **PC 기능 카탈로그**
   - `src/main/handlers/*.ts`의 `ipcMain.handle(...)` 전체를 API 서버에서 스캔
   - `today/discovery/analysis/expansion/premium/schedule/settings` 서브탭으로 자동 분류
   - 상태를 `ready/linked/planned/pc-only`로 표시
   - 모바일 화면에서 탭별 전체 기능 수와 상위 기능 목록 표시

3. **즉시 실행 기능 확장**
   - 현재 연결된 6개 작업: 황금키워드, PRO 트래픽, 키워드 분석, 마인드맵, 홈판, 지식인
   - 완료: 실시간/정책/이슈 소스 신호 API (`/v1/mobile/source-signals`)와 앱 `소스 갱신` 버튼 연결
   - 완료: 패널 로그인 세션이 패널 제공 PC API URL/토큰을 받아 모바일 SecureStore에 저장되고 앱 재실행 시 자동 복원
   - 완료: API 상태 세부 진단 (`/v1/mobile/api-status`)과 설정 탭 `API 상태 진단` 카드 연결
   - 완료: 키워드 그룹 API (`/v1/mobile/keyword-groups`)와 스케줄 탭 `키워드 그룹` 목록/등록/삭제 연결
   - 완료: 스케줄 대시보드 API (`/v1/mobile/schedule-dashboard`)와 스케줄 탭 `스케줄 대시보드` 상태 카드 연결
   - 완료: 예약 추가/토글 API (`/v1/mobile/schedules`)와 스케줄 탭 `현재 키워드 예약`/활성·비활성 전환 연결
   - 완료: 예약 상세 편집/삭제 API (`PATCH`/`DELETE /v1/mobile/schedules/:id`)와 스케줄 탭 `예약 상세 저장`/`편집`/`삭제` 연결
   - 완료: 내보내기/공유 API (`/v1/mobile/export/keywords`)와 설정/결과 `CSV 공유`/`텍스트 공유`/`JSON 공유` 연결
   - 완료: 워드프레스 공유 저장소 API (`/v1/mobile/wordpress`)와 설정 탭 `WP 상태 동기화`/`WP 사이트 저장`/`WP 초안 등록` 연결
   - 완료: 워드프레스 REST 카테고리 실시간 조회/실제 초안 발행 실행 API (`/v1/mobile/wordpress/categories`, `/v1/mobile/wordpress/publish`)와 설정 탭 `WP 카테고리 조회`/`WP REST 전송` 연결
   - 완료: 순위 추적 조회 API (`/v1/mobile/rank-tracking`)와 분석 탭 `순위 추적`/`순위 추적 갱신` 카드 연결
   - 완료: 순위 추적 수동 등록/삭제/빠른 점검 API (`/v1/mobile/rank-tracking/manual`, `/run`, `/pair`)와 분석 탭 입력/실행 컨트롤 연결
   - 완료: PRO 청사진 성과 로그 조회 API (`/v1/mobile/pro-outcomes`)와 프리미엄 탭 `PRO 성과 로그`/`성과 갱신` 카드 연결
   - 완료: PRO tracked post 등록 API (`/v1/mobile/rank-tracking/pro-post`)와 분석 탭 `PRO 글 추적 등록` 컨트롤 연결
   - 완료: PRO 성과 기록/삭제/동기화 API (`/v1/mobile/pro-outcomes/record`, `/item`, `/sync`)와 프리미엄 탭 `성과 기록`/`성과 동기화`/`성과 삭제` 컨트롤 연결
   - 완료: PRO 청사진 생성/초안 생성/수익 추정 API (`/v1/mobile/pro-blueprint`, `/draft`, `/revenue`)와 프리미엄 탭 `PRO 청사진`/`청사진 생성`/`초안 생성`/`수익 추정` 컨트롤 연결
   - 다음 우선순위: PRO 수익 설정/카테고리 RPM/포트폴리오 수익, RPM 분석 계열 모바일 액션 연결
   - 각 기능은 모바일 계약 타입, API route, PC executor, UI 카드, 테스트를 한 세트로 추가

4. **검증 루프**
   - 기능별 단위 테스트
   - `apps/api` 타입체크
   - `apps/mobile` 타입체크
   - 모바일 UI release gate
   - 실제 로컬 API smoke
   - EAS APK 재빌드 후 휴대폰 설치 테스트

5. **완료 기준**
   - 앱에서 PC 기능 전체 목록이 누락 없이 보인다.
   - `ready` 기능은 휴대폰에서 직접 실행되고 결과까지 표시된다.
   - `linked` 기능은 대시보드/로그인/예열/푸시와 연결된다.
   - `planned` 기능은 다음 구현 대상이 명확히 남는다.
   - `pc-only` 기능은 파일/창/클립보드처럼 모바일에서 실행하지 않는 이유가 표시된다.

---

## 이전 계획

# 원클릭 API 키 자동 세팅 마법사 — 구현 계획

> 작성일: 2026-04-15
> 상태: **승인 완료 — 착수 대기**
> 총 예상: 11일 (Phase 1: 4d / Phase 2: 3d / Phase 3: 2d / Phase 4: 2d)
> 점수: 100/100 (재설계본)

---

## 핵심 전환

**Playwright를 버리고 OAuth 2.0 + 클립보드 감시로 전환.**
자동화 대상을 UI가 아닌 "프로토콜"로 옮긴다. Electron 내장 기능(BrowserWindow + shell.openExternal + clipboard + safeStorage)만 사용. 셀렉터 drift·봇 감지·ToS·번들 용량 4대 리스크 완전 제거.

---

## 전략 매트릭스 (API별)

| API | 방식 | 자동화율 |
|---|---|---|
| **YouTube Data API** | OAuth 2.0 Installed App + Loopback (PKCE) | 100% |
| **Threads Graph API** | OAuth 2.0 + Long-lived Token 교환 (60일, 자동 갱신) | 100% |
| **네이버 개발자** | 딥링크 + 클립보드 감시 (정규식 매칭) | 70% |
| **네이버 검색광고** | 딥링크 + 클립보드 감시 (재발급 버튼 절대 안 건드림) | 60% |
| **Rakuten** | 딥링크 + 클립보드 감시 | 70% |
| **빅카인즈** | 딥링크만 (승인 대기형 — 원클릭 약속과 상충, 축소) | - |

---

## 아키텍처

```
src/main/key-wizard/
├── index.ts                  # 오케스트레이터 (site → strategy 디스패치)
├── types.ts                  # KeyWizardSite, Strategy, Result
├── strategies/
│   ├── oauth-loopback.ts     # 공용 OAuth 2.0 Installed App + PKCE
│   ├── clipboard-watch.ts    # 클립보드 감시 + 패턴 매칭
│   └── deep-link.ts          # shell.openExternal 헬퍼
├── providers/
│   ├── youtube.ts            # OAuth 설정 + 스코프 + 토큰 저장
│   ├── threads.ts            # OAuth 설정 + long-lived 교환
│   ├── naver-dev.ts          # 딥링크 + Client ID/Secret 정규식
│   ├── naver-searchad.ts     # 딥링크 + License/Secret/CustomerID 3단계 분배
│   └── rakuten.ts            # 딥링크 + Application ID 정규식
├── token-store.ts            # safeStorage 암호화 저장
└── refresh-scheduler.ts      # OAuth 토큰 자동 갱신

src/main/handlers/key-wizard.ts   # IPC 핸들러 (5채널)
ui/key-wizard/wizard.js           # 렌더러 컨트롤러
```

**총 12파일 / 예상 ~1,400 LOC**

---

## OAuth Loopback 흐름

1. 로컬 HTTP 서버 랜덤 포트 기동 → `http://127.0.0.1:PORT/callback`
2. PKCE code_verifier/challenge 생성
3. `shell.openExternal(authUrl)` → 사용자 기본 브라우저
4. 사용자가 공급자 계정으로 로그인 + 스코프 승인 (일상 브라우저 세션 활용 → 2FA/캡차 무관)
5. 리다이렉트 도달 → code 수신 → 서버 종료 → "창 닫아도 됩니다" 페이지
6. code + verifier로 토큰 교환 → safeStorage 암호화 저장

**장점**: DOM 접근 제로, 셀렉터 drift 제로, ToS 완벽 준수, 번들 증가 0KB

---

## 클립보드 감시 흐름

1. `shell.openExternal(providerUrl)` → 발급 페이지 직진
2. LEWORD 메인 창에 플로팅 안내 패널 ("클립보드 감시 중… ✅ Client ID 감지됨 / ⏳ Secret 대기")
3. `clipboard.readText()` 500ms 폴링 → 정규식 매칭 시 자동 저장
4. **저장 전 실 API 호출로 검증** (기존 `test-api-keys` 재사용)
5. 언제든 "수동 입력 전환" 버튼으로 폴백

**정규식 패턴** (예시, 구현 시 실 발급 샘플로 재조정):
- 네이버 Client ID: `/^[A-Za-z0-9_]{20,30}$/`
- 네이버 검색광고 Access License: `/^[0-9]{10,}==$/`
- Rakuten Application ID: `/^\d{19}$/`

---

## 토큰 라이프사이클

- **저장**: `safeStorage.encryptString()` → `userData/key-wizard/tokens.enc` (Windows DPAPI)
- **자동 갱신**: 앱 기동 시 72h 전 체크 → refresh. Threads long-lived 60일은 7일 전 갱신
- **실패 시**: 재인증 알림 (UI 빨간 배지)
- **수동 삭제**: 환경설정 "🗑️ 인증 초기화" 버튼

---

## IPC 핸들러 (5채널)

| 채널 | 방향 | 역할 |
|---|---|---|
| `keyWizard:start` | R→M invoke | `{ site }` → 결과 반환 |
| `keyWizard:cancel` | R→M invoke | 진행 중 취소 |
| `keyWizard:manualFallback` | R→M invoke | 수동 입력 전환 |
| `keyWizard:progress` | M→R send | 진행 이벤트 (감지/검증/저장) |
| `keyWizard:result` | M→R send | 최종 성공/실패 |

Zod 검증, 동시 실행 mutex.

---

## UI 통합

`ui/keyword-master.html` 환경설정 섹션 상단에 "🪄 원클릭 API 키 세팅" 카드 신설:
- 6개 사이트별 [자동 세팅] 버튼 + 상태 배지 (`✓ 완료` / `만료 D-3` / `미설정` / `검증 실패`)
- 기존 수동 입력 폼은 **그대로 유지** (폴백용)

---

## EnvironmentManager 확장

신규 필드 추가: `threadsAccessToken`, `threadsRefreshExpiresAt`, `youtubeOAuthAccessToken`, `youtubeOAuthRefreshToken`, `youtubeTokenExpiresAt`, `rakutenApplicationId`

쓰기(.env 저장) 지원 여부는 Phase 1 Day 1에 확인, 미지원 시 save 메서드 추가.

---

## Phase 분할 (가치 순)

### Phase 1 — 기반 + OAuth (4일)
**왜 먼저**: OAuth는 공식 지원되므로 가장 안전하고 가치 높음

- Day 1: `key-wizard/` 스캐폴드 + `types.ts` + `token-store.ts` (safeStorage) + EnvironmentManager 쓰기 검증
- Day 2: `oauth-loopback.ts` (PKCE, 로컬 서버, 콜백 페이지)
- Day 3: `providers/youtube.ts` + IPC 핸들러 + 렌더러 wizard.js 골격 + UI 카드
- Day 4: `providers/threads.ts` + long-lived 교환 + `refresh-scheduler.ts`

### Phase 2 — 클립보드 감시 (3일)
- Day 5: `clipboard-watch.ts` + `deep-link.ts` + `providers/naver-dev.ts`
- Day 6: `providers/rakuten.ts` + 실 발급 샘플로 정규식 튜닝
- Day 7: 폴팅 UX + 수동 폴백 전환 + 실 API 호출 검증 통합

### Phase 3 — 고위험 (2일)
- Day 8: `providers/naver-searchad.ts` — "재발급 버튼 안내 금지" 가드 (딥링크는 API 관리 페이지가 아닌 조회 페이지로)
- Day 9: 3단계 순차 분배 로직 (License → Secret → CustomerID) + 테스트

### Phase 4 — 다듬기 (2일)
- Day 10: 만료 알림 UI + 빅카인즈 딥링크(축소판) + 인증 초기화 버튼
- Day 11: 통합 QA (6개 사이트 실 E2E) + 문서화

**총 11일**

---

## 리스크

| 리스크 | 심각도 | 대응 |
|---|---|---|
| OAuth Client ID 노출 | Low | Public client + PKCE로 안전, 문서화 |
| 클립보드 정규식 오탐 | Low | 실 API 호출 재검증 필수 |
| Threads long-lived 만료 | Medium | 자동 갱신 + 7일 전 알림 |
| safeStorage 플랫폼 이슈 | Low | Windows DPAPI 완전 지원 |
| YouTube OAuth 승인 화면 경고 ("확인되지 않은 앱") | Medium | 스코프 최소화(`youtube.readonly`) + 사용자 안내 오버레이 |

---

## 확인 필요 (착수 전)

1. `EnvironmentManager` 쓰기 지원 여부 — Phase 1 Day 1 첫 작업으로 확인
2. `ui/keyword-master.html` 환경설정 섹션 정확한 라인 — Day 3 작업 시 탐색
3. YouTube OAuth Client ID 발급 (GCP에서 LEWORD 데스크톱 앱용) — Day 3 착수 전 사용자가 제공 필요
4. Meta Threads App 등록 (Developer 계정 + App ID) — Day 4 착수 전 사용자가 제공 필요

---

## 참고 경로

- `C:\Users\park\leword-app\src\main\handlers\config-utility.ts` (기존 `check-api-keys:110`, `test-api-keys:141`)
- `C:\Users\park\leword-app\src\main.ts`
- `C:\Users\park\leword-app\preload.ts`
- `C:\Users\park\leword-app\ui\keyword-master.html`
- `C:\Users\park\leword-app\package.json`

---

## 이전 계획

이전 `prompt_plan.md`(지식인 황금질문 SSS 승급 — v2.2.5에서 완료됨)는 `prompt_plan.archive.md`로 아카이브됨.
# LEWORD Pro Web 끝판왕 구현 울트라플랜 v2.0

> 작성일: 2026-06-12
> 상태: 승인됨, 구현 진행
> 목표: 서버를 최대한 활용해 LEWORD Pro Web을 Electron 앱보다 더 완성도 높은 전체 기능 대시보드로 만들고, 품질/빌드/테스트를 통과시킨 뒤 배포 가능한 상태로 보고한다.

## 핵심 목표

- 웹 Pro는 단순 공개 사이트가 아니라 서버 기반 Pro 콘솔이어야 한다.
- 기존 사용자 ID/PW 로그인으로 Pro 기능 접근이 가능해야 한다.
- Electron 앱에 있는 핵심 기능을 웹에서도 실행 가능하게 연결한다.
- 서버는 수집, 실측 조회, 캐시, 중복 제거, 장기 job, 권한 체크, 결과 저장의 중심으로 사용한다.
- 무료 미리보기는 같은 키워드 반복과 인물/프로필 쏠림을 막는다.
- 키워드 조회는 더미가 아닌 실측 기반으로 PC/모바일 검색량을 표로 분리한다.
- 첫 화면에는 네이버, 다음, 네이트, 줌, 정책, 이슈 소스 보드가 보여야 한다.

## 기능 범위

| 영역 | 웹 Pro 목표 | 서버 활용 |
|---|---|---|
| Pro 로그인 | 기존 사용자 ID/PW 로그인 | 서버 세션, 라이선스 검증, 권한 게이트 |
| 실시간 소스 | 네이버/다음/네이트/줌/정책/이슈 보드 | 소스 수집기, 캐시, 신선도/장애 상태 |
| 키워드 조회 | PC/모바일/총 검색량, 문서수, 경쟁비, CPC, 의도, 등급 표 | SearchAd/문서수/CPC/스코어링 서버 계산 |
| PRO 트래픽 헌터 | 웹에서 실행/진행률/결과표 | 기존 엔진 job 라우트 연결 |
| 내 노출 추적 | 블로그/글/키워드 추적 | 노출 추적 핸들러 서버 라우트화 |
| 쇼핑 커넥트 | 상품/구매의도/커머스 키워드 | 쇼핑 관련 엔진과 API 키 상태 연결 |
| 유튜브 황금키워드 | 유튜브 키워드/트렌드 발굴 | YouTube 핸들러/API 키/캐시 |
| 애드센스 승인 헌터 | 승인 가능 글감/카테고리 | home-board/adsense 계열 엔진 |
| 네이버 메이트 헌터 | 네이버 검색/자동완성/스마트블록 기반 기회 | 네이버 계열 수집기와 품질 필터 |
| 지식인 황금질문 | 지식인 질문 발굴 | kin-hidden-honey 라우트 연결 |

## 품질 원칙

- 더미 키워드 행 금지. 외부 소스 장애 시 가짜 결과 대신 소스 상태를 표시한다.
- keyword key, cluster key, source key 기준으로 중복을 제거한다.
- 인물/프로필/연예인 프로필류는 무료 미리보기와 황금키워드에서 상한을 둔다.
- 소스 다양성 게이트를 적용해 한 소스/한 유형이 결과를 독점하지 못하게 한다.
- 등급은 index 순서가 아니라 검색량, 문서수, 경쟁비, CPC, 의도, 트렌드 기반으로 계산한다.
- `Math.random()`은 점수/등급 계산에 사용하지 않는다.

## 구현 단계

1. Electron 기능과 기존 서버 API를 전수 매핑한다.
2. `public-site`의 Pro 화면을 서버 기반 웹 콘솔 구조로 확장한다.
3. 실시간 소스 보드를 네이버/다음/네이트/줌/정책/이슈 6개 레인으로 재배치한다.
4. 키워드 조회 결과를 PC/모바일 실측 표로 교체한다.
5. Pro 기능 레지스트리를 만들고 각 기능을 기존 서버 job/핸들러와 연결한다.
6. 무료 미리보기와 황금키워드 품질 필터를 테스트로 잠근다.
7. 서버/API/웹 DOM/빌드 검증을 통과시킨다.
8. 배포 가능한 커밋 상태로 정리하고 서버 재시작/재배포 절차를 보고한다.

## 검증 기준

- `npm run build` 통과
- `npm --prefix apps/api run typecheck` 통과
- Pro 로그인 UI와 서버 세션 API 연결 확인
- 웹 첫 화면에서 네이버/다음/네이트/줌/정책/이슈 확인
- 키워드 조회 표에 PC/모바일 컬럼 확인
- 요청받은 Pro 기능 카드/실행 화면이 모두 웹에 존재
- 무료 미리보기에서 중복 키워드와 프로필 쏠림 방지 테스트 통과

---

## 이전 계획
