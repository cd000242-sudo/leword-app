# IMPLEMENTATION PLAN — HOMEFEED STORY RADAR v2.0 (`/leword?tab=homefeed`, 라벨 "홈판 신호")

작성 2026-09-16. 저장소 두 곳을 먼저 해부한 뒤 쓴 계획이다(조사 근거는 파일:행으로 적는다).
- **APP** = `C:\Users\park\leword-app` (Electron 앱 · CI 스크립트 · 워커 소스 사본)
- **SITE** = `C:\Users\박성현\Desktop\리더 네이버 자동화` (leaderspro.kr, SPA = `spa/`)

## 0. 사장님 결정(이 계획의 전제)
| 항목 | 결정 |
|---|---|
| 원고 | 명령서대로 **본문까지** 생성 — 이 탭 한정 예외(기록된 "발굴 전용" 원칙의 예외) |
| AI 이미지 | **구독 에이전트로 시도** — 코덱스 내장 `image_gen`(API 키 불필요). 유료 API 연결 안 함 |
| 사이트 AI | 앱 브리지 전용(2026-09-16 배포) — 사이트 · 워커는 토큰 · 서버 키로 AI 를 부르지 않는다 |
| 비용 | 유료 API 금지. 구독 에이전트 · 사용자 본인 네이버 키만 |

## 1. 현재 구조(해부 결과)
| 영역 | 사실 | 근거 |
|---|---|---|
| 사이트 스택 | React 18.3 · Vite 5.4 · TS 5.9 strict · react-router 6 · 전역 스토어 없음 · `<style>` 문자열 CSS(`lw-*`) · 차트/아이콘 라이브러리 없음 | SITE spa/package.json:14-23, LewordStyles.tsx:8-10 |
| 탭 구조 | `TABS` 배열 · `?tab=` · GUEST_TABS(golden, issue) · 정적 import · 조건부 렌더 | SITE spa/src/pages/LewordPage.tsx:30-43,54-63,324-337 |
| 이슈 탭 | IssueNicheTab.tsx(517줄) — 정적 JSON `/data/issue-niche-board.json`(하루 3회 CI, 1~3시간 지연) + 워커 `realtime-issues`/`hot-keywords` 5분 폴링 | SITE IssueNicheTab.tsx:144-200, issueFlow.ts:125-169 |
| 이슈 보드 생산 | APP `.github/workflows/issue-niche-board.yml`(KST 05:23·11:23·17:23) → `issue-niche-board.js` → 사이트 레포 커밋(leword-bot) | APP issue-niche-board.yml:40-395 |
| 실시간 원천 | Signal.bz(`getSignalBzKeywords`) — 원천 자체가 20~30분 늦음 | APP src/utils/signal-bz-crawler.ts:61-99, worker.js:3570-3574 |
| 이력 | **10분 이력을 쌓는 곳 없음** — 워커 크론 미실행, KV 최신 1벌 덮어쓰기(firstSeenAt · prevRank 1세대), 스냅샷 파일 · first_seen 장부 없음 | worker.js:3676-3737,5050-5056; realtime-niche.ts:247-249 |
| 워커 브리프 | issue-brief = 뉴스(최신순) + og:image ≤3 + 자동완성, 외부 호출 최대 8회 · KV 쓰기 1회 — 10분마다 여러 이슈에 부르면 KV 하루 쓰기 1,000회 초과 | worker.js:4150-4329 |
| 앱 주기 실행 | realtime-niche: setInterval + prefs.json 기억 + 앱 시작 시 복원, 집 회선 보호(직렬 · 간격) | APP src/main/handlers/realtime-niche.ts:300-406 |
| 측정 유틸 | 뉴스 헤드라인 파서(title · press · publishedAt · link) · 블로그 문서수(15분 캐시) · 검색광고 · 쿼터 거버너 | APP issue-context.ts:129-147,258; naver-blog-api.ts:771-850; searchad-quota-governor.ts:21-37 |
| 유사도 | 워커 `isNearDuplicate`(조사 · 활용어미 정규화 + 어절 겹침 0.45) — TS 공용 유틸은 없음 | worker.js:4038-4065 |
| AI | 구독 에이전트 체인(runWithAnyAgent · 답 검증 · 엔진 쉬게 하기) · 브리지 "재료만 받기" · 사이트는 404=구버전 구분 | APP runAny.ts, web-bridge.ts:69-71,389-430; SITE spa/src/lib/bridge.ts:56-86 |
| 제목 교리 | 상투구 SSoT `TITLE_CLICHES` · 쉼표 이분법 금지 · 답 숨김 · 구어체 · 원문 없는 숫자 기각 | APP title-forge/forge.ts:103; post-ideas-prompt.ts:54-89; llm-title-writer.ts:64-72 |
| 이미지 | 앱에 이미지 생성 코드 없음. 에이전트 실행기는 문자열만 반환(codex 읽기 전용) | APP agent-cli/runAny.ts:40, codexRunner.ts:63-65 |
| 코덱스 이미지 | 0.153.4 `image_generation stable true`, 공식 스킬 = 내장 `image_gen`(API 키 불필요, `$CODEX_HOME/generated_images`), 예비 `scripts/image_gen.py` 는 OPENAI_API_KEY 필요 → 금지. **이 PC 계정 한도 소진, 09-21 10:24 재개** | `~/.codex/skills/.system/imagegen/SKILL.md`, 실측 이벤트 로그 |
| 성과 데이터 | 글별 조회 · 유입 경로를 읽는 코드 없음(블로그 관리자 통계 = 로그인 필요). 수동 입력 · 표본 5 미만 비율 금지 패턴 있음 | APP outcome-recorder.ts:11-23, feedback-learner.ts:13-39 |
| 저장소 | **DB · ORM 없음.** JSON(스키마 버전 문자열 `'<이름>-v1'` · tmp→rename 원자적 쓰기 · `.lock`) · KV · GAS 시트 | APP searchad-volume-cache.ts:20,193-267; home-notices.ts:269-283 |
| 오너 판별 | SPA 에 없음(보안 경계 아님) | SITE siteOps.ts:915-916 |
| 테스트 · 빌드 | APP: `npm run build`(tsc×2) · vitest + ts-node assert(게이트 `scripts/run-sanity-gate-test.js` 등록) · 푸시 CI 없음 / SITE: `spa` `npm run build`(tsc+vite+정적 페이지) · `node --test`(deploy-pages.yml:48 목록에 직접 등록) | 조사 D |
| 추정치 금지 테스트 | APP preemption-gate.test.ts:154 등(점수·확률·예상·추정 금지, 미측정) | 조사 D |

## 2. 설계 결론
1. **수집 · 판정 · AI 는 PC 앱**(`APP src/main/homefeed/*`), **화면은 사이트 탭**(`SITE spa/.../homefeed/*`), 둘 사이는 **앱 브리지 새 경로**. 이유: 10분 이력을 믿고 쌓을 곳이 앱뿐(워커 크론 죽음 · 깃허브 예약 2~4시간 지연 · KV 쓰기 한도), 사이트 AI 는 브리지 전용 결정, 원고 · 이미지 생성도 구독 에이전트.
2. **원천 재사용(새 크롤러 없음):** Signal.bz 수집기(실시간 순위) · 네이버 뉴스 검색(표본 제목 · 링크 · 언론사 · 발행 시각 · 뉴스 total) · 블로그 문서수 함수 · 워커의 og:image 추출 로직(TS 로 옮김, URL 당 1회 · 직렬) · 사이트 이슈 보드 `issues[]`(why · headlines, 있으면 근거로 합침).
3. **"DB 테이블" = 앱 userData JSON 저장소**(스키마 버전 · 원자적 쓰기 · 보존 기간). 운영 DB 가 없으므로 파괴적 마이그레이션 자체가 없다.
4. **사이트 탭은 로그인 탭**(GUEST_TABS 에 넣지 않음). 앱이 꺼져 있으면 안내 + 다운로드 링크, 구버전이면 업데이트 안내. 기존 이슈 탭 코드는 건드리지 않는다.
5. **가짜 수치 금지:** 창(WINDOW) · 상태(STATUS)는 사유 코드와 실측값으로만. 확률 · 점수 · "N/10" 없음. 못 잰 값 = `미측정`.

## 3. 재사용 모듈
| 용도 | 재사용 | 비고 |
|---|---|---|
| 실시간 순위 | `getSignalBzKeywords` | 광고 필터 · 순위 재계산 포함 |
| 뉴스 표본 | `parseNewsHeadlines` · `stripNewsMarkup` · `naverApiFetch`(API HUB 폴백) | sort=date(최신 표본) + total 보존 |
| 블로그 문서수 | `getNaverBlogDocumentCount` | 15분 캐시 · 쿼터 장부 |
| 네이버 자격 | `EnvironmentManager` | 사용자 본인 키 |
| 이슈 개체 | `issueEntity` · `compactKey` | issue-context.ts |
| 제목 교리 | `TITLE_CLICHES`, post-ideas 파서 방식 | 쉼표 · 상투구 · 답 누설 검사 |
| AI | `runWithAnyAgent` · `createDefaultAgentChain` · `replyValidators` · `usageLedger` · `engineHealth` | 사용자가 누를 때만 |
| 주기 실행 | realtime-niche 의 prefs · 복원 · running 가드 패턴 | |
| 브리지 | `createWebBridge` 라우팅 · `readBody` · 허용 출처 | 재료만 받기 |
| 사이트 | `bridgeCall` 규칙(ok/offline/outdated/error) · `TabIntro` · `ErrorNote` · `ImageLightbox` · 모달 패턴 · `lw-*` CSS | `bridgeCall` 을 export |

## 4. 새 파일
**APP — 판정 엔진(순수 함수, vitest)** `src/utils/homefeed/`
| 파일 | 내용 |
|---|---|
| `types.ts` | 스냅샷 · 원천 · 신호 상태 · 스토리 · 이미지 후보 · 썸네일 · 제목 · 제목-이미지 조합 · 원고 · 발행 · 성과 · 설정 타입, 스키마 버전 상수 |
| `settings.ts` | 중앙 설정 기본값(hypothesis defaults) · 범위 검사 · 병합 |
| `text.ts` | 키워드 · 제목 정규화, 조사 · 활용어미 토큰화(워커 isNearDuplicate 이식), 자카드 |
| `clusters.ts` | 유사 제목 묶음(union-find) · dominant/alternative angle · 정보층(reveal) |
| `signals.ts` | first_seen · age · 원천 확산 · 문서 속도 · 가속 · 순위 변화 · 지속성 · 포화 · 이미지 후보 수 |
| `story.ts` | KNOWN ANCHOR · FRESH DELTA · TENSION · FUN GAP 근거 · PAYOFF · NO-SEARCH · TELLABILITY · FIRST CARD |
| `status.ts` | WINDOW · STATUS 판정(사유 코드) · 정렬 |
| `visual.ts` | 이미지 전략(REAL/AI/HYBRID) · 실제 이미지 가이드 · AI 프롬프트 KO/EN · 썸네일 계획 · 준비도 |
| `titles.ts` | 제목 AI 프롬프트 · 파서 · STOP/FLAT/OVER 결정론 검사 · 제목-이미지 조합 |
| `draft.ts` | 원고 AI 프롬프트 · 결정론 검사(최종 제목 줄 · `###` 금지 · 해시태그 5~10 · 이미지 배치 가이드) |
| `calibration.ts` | 성과 집계(n<5 표본부족 · n<20 성공률 금지 · 중앙값 · p25/p75) |

**APP — 메인 프로세스** `src/main/homefeed/`
| 파일 | 내용 |
|---|---|
| `store.ts` | userData/homefeed 경로 · 원자적 JSON 쓰기 · 보존 정리 |
| `collector.ts` | 한 회차 수집 → 스냅샷 · 원천 상태 · first_seen 장부 |
| `og-image.ts` | 기사 페이지 og:image(URL 당 1회 캐시, 직렬, 4초 제한) |
| `engine.ts` | 이력 창 읽기 → 신호 → 스토리 → stories.json |
| `scheduler.ts` | 주기(기본 10분, 하한 5분) · 켜기/끄기 기억 · 앱 시작 복원 · 중복 실행 방지 |
| `ai.ts` | 제목 · 원고 · 이미지 프롬프트 다듬기(구독 체인) · 이미지 생성(코덱스) · 결과 캐시(근거 해시) |
| `bridge-deps.ts` | 브리지 호스트에 넘길 함수 묶음 |

**APP — 에이전트** `src/utils/agent-cli/codexImageRunner.ts` — `codex exec -s workspace-write -C <작업폴더> --json -c forced_login_method="chatgpt"`, stdin 차단, 내장 image_gen 만 허용(예비 CLI 흔적이면 실패), PNG 검증 후 이동, 한도 오류 = rate_limited(재개 시각).

**SITE** `spa/src/components/leword/homefeed/`
| 파일 | 내용 |
|---|---|
| `HomefeedTab.tsx` | 상단 상태(갱신 · 주기 · 원천 정상/오류 · NOW/EARLY/WATCH 수 · OPEN 수) · 필터 · 목록 · 빈/로딩/오류 · 앱 꺼짐 안내 |
| `HomefeedFilters.tsx` | 카테고리 · WINDOW · STATUS · 기간 · FUN GAP · NO-SEARCH · PAYOFF≥2 · VISUAL READY · 검색 |
| `HomefeedStoryCard.tsx` | 스토리 카드(명령서 10항 모양) |
| `HomefeedDetail.tsx` + `HomefeedDetailSections.tsx` | 상세 12구획 |
| `HomefeedFirstCard.tsx` | 중립 feed-card 3안 + 버튼 |
| `HomefeedVisualGuide.tsx` | 전략 · 실제 이미지 가이드 · AI 프롬프트 · 썸네일 |
| `HomefeedTitles.tsx` | STOP 3 + 제목-이미지 조합 선택 |
| `HomefeedDraft.tsx` | 원고 생성 · 복사 |
| `HomefeedImageGen.tsx` | 프롬프트 미리보기 · 수정 · 생성 · 원본/썸네일 crop/16:9 미리보기 |
| `HomefeedPerformance.tsx` | 발행 기록 · T+30m/2h/6h/24h 입력 · 성과학습 표 |
| `HomefeedSettings.tsx` | 관리자 설정 |
| `HomefeedStyles.tsx` | `lw-hf-*` CSS |
| `spa/src/lib/homefeedBridge.ts` | 브리지 호출 · 응답 모양 검사 |
| `spa/src/lib/homefeedModel.mjs` + `.d.mts` | 필터 · 정렬 · 라벨 · 미측정 표기(순수, node --test) |
| `spa/tests/homefeed-*.test.mjs` | 모델 · 계약 · 금지어 테스트 |

## 5. 수정 파일(최소 침습)
| 파일 | 변경 |
|---|---|
| APP `src/main/web-bridge.ts` | `WebBridgeDeps.homefeed?` 타입 + `/v1/bridge/homefeed/*` 경로(재료만 받기 · 허용목록 · 길이 절단) |
| APP `src/main/web-bridge-host.ts` | homefeed 의존성 연결 |
| APP `src/main/keywordMasterIpcHandlers.ts` | 앱 시작 시 수집 주기 복원 |
| APP `src/utils/agent-cli/parse.ts` | "try again at <날짜/시각>" 절대 재개 시각 해석(코덱스 한도 안내 · 쿨다운 정확도) |
| APP `scripts/run-sanity-gate-test.js` | 새 vitest 등록 |
| SITE `spa/src/pages/LewordPage.tsx` | TABS 에 `homefeed`(issue 바로 뒤) · import · 렌더 한 줄 |
| SITE `spa/src/components/leword/LewordStyles.tsx` | 탭 색 한 줄 |
| SITE `spa/src/lib/bridge.ts` | `bridgeCall` export |
| SITE `.github/workflows/deploy-pages.yml` | 새 node --test 파일 목록 추가 |
이슈 탭(IssueNicheTab · issueFlow · PreemptionCard) · 검색량/경쟁도 계산 · 로그인/결제는 **변경 없음**.

## 6. "DB" = 앱 JSON 저장소(비파괴)
`%APPDATA%\leword\homefeed\` (userData 아래)
| 명령서 테이블 | 파일 | 스키마 버전 |
|---|---|---|
| A homefeed_issue_snapshots | `snapshots/YYYY-MM-DD/HHmmss.json` | `homefeed-snapshot-v1` |
| B homefeed_sources | `sources.json`(원천별 on/off · 마지막 성공/오류 · 연속 실패) | `homefeed-sources-v1` |
| C homefeed_signal_state | `signal-state.json`(issue_key → first_seen_at · last_seen_at · censored) | `homefeed-signal-state-v1` |
| D homefeed_story_candidates | `stories.json`(최신 계산본) | `homefeed-stories-v1` |
| E homefeed_visual_candidates | `assets/<storyId>.json` 의 visuals | `homefeed-assets-v1` |
| F homefeed_title_candidates | `assets/<storyId>.json` 의 titles · pairs | 〃 |
| G homefeed_posts | `posts.json`(선택 스토리 · 제목 · 이미지 · 썸네일 · 발행 시점 신호) | `homefeed-posts-v1` |
| H homefeed_performance_snapshots | `performance.json` | `homefeed-performance-v1` |
| 설정 | `settings.json` | `homefeed-settings-v1` |
| 생성 이미지 | `images/<imageId>.png` + `images/<imageId>.json`(프롬프트 · 생성 사실 · ai_generated) | |
- 읽기는 버전이 다르면 무시하고 새로 만든다(기존 규칙). 쓰기는 tmp → rename. 보존: 스냅샷 기본 7일(설정).
- **마이그레이션 없음 · 롤백 = 기능 끄기 + 폴더 삭제**(다른 데이터에 영향 없음).

## 7. API(앱 브리지, 127.0.0.1:47615 · 허용 출처만)
| 경로 | 입력(재료만) | 출력 |
|---|---|---|
| GET `/v1/bridge/homefeed/stories` | — | 수집 상태 · 원천 상태 · 개수 · 스토리 요약 목록 |
| POST `/v1/bridge/homefeed/story` | `{ id }` | 상세(타임라인 · 원천 · 묶음 · 델타 · 각도 · fun gap · no-search · payoff · first card · 이미지 전략 · 썸네일 · NOW 사유 · 위험 · 캐시된 AI 결과) |
| POST `/v1/bridge/homefeed/collect` | `{}` | 지금 한 회차 수집 + 재계산(실행 중이면 거절) |
| POST `/v1/bridge/homefeed/visual` | `{ id, refine?: boolean, provider? }` | 전략 · 실제 이미지 가이드 · AI 프롬프트 · 썸네일 계획 |
| POST `/v1/bridge/homefeed/titles` | `{ id, provider? }` | STOP 3 · 전체 분류 · 제목-이미지 조합 |
| POST `/v1/bridge/homefeed/select` | `{ id, titleId, visualId, thumbnailCopy? }` | 선택 저장 |
| POST `/v1/bridge/homefeed/draft` | `{ id, provider? }` | 원고 · 검사 결과 |
| POST `/v1/bridge/homefeed/image` | `{ id, visualId, promptKo?, promptEn?, aspectRatio? }` | 생성 이미지 id · 크기 · 미리보기 data URL · 한도 안내 |
| POST `/v1/bridge/homefeed/publish` | `{ id, postUrl, publishedAt }` | 발행 기록 |
| POST `/v1/bridge/homefeed/performance` | `{ postId, checkpoint, metrics }` | 성과 스냅샷 |
| GET `/v1/bridge/homefeed/calibration` | — | 패턴별 집계(n 게이트) |
| GET · POST `/v1/bridge/homefeed/settings` | 설정 일부 | 병합된 설정 |
AI · 이미지 경로는 목록 조회에서 절대 부르지 않는다. 사용자가 버튼을 누른 요청에서만.

## 8. 수집기(worker 대신 앱 주기 실행)
1. 주기: 설정 `snapshotIntervalMinutes`(기본 10, 하한 5). 켜짐 여부 · 간격을 settings.json 에 기억, 앱 시작 시 복원, 이미 도는 중이면 건너뜀.
2. 회차: Signal.bz 실시간 → 이슈 상한(기본 12) → 이슈마다 뉴스 검색(최신순 10건, total) · 블로그 문서수 → 새 기사 URL 만 og:image(직렬 · 1.2~1.8초 간격 · URL 당 1회) → 사이트 이슈 보드 `issues[]` 가 6시간 안 발행본이면 why · headlines 를 근거로 합침 → 스냅샷 저장 → 원천 상태 · first_seen 갱신 → 엔진 재계산.
3. 원천 실패는 그 원천만 `오류`로 표시하고 나머지는 계속. 값이 없으면 null(추정 금지). 네이버 키가 없으면 뉴스/문서수 원천을 `미설정`으로 두고 순위만 쌓는다.

## 9. AI 어댑터 · 이미지
- 텍스트 AI(스토리 보강 · 제목 · 원고 · 프롬프트 다듬기): `runWithAnyAgent` + 모양 검증(같은 파서) + 근거 해시 캐시.
- 이미지: `ImageProvider` 인터페이스 — `codex-builtin`(기본, 구독) · `none`(프롬프트 복사). 한도 · 로그인 · 미설치는 사유와 재개 시각을 그대로 화면에.
- 금지: 예비 CLI(OPENAI_API_KEY) · 워터마크 제거 · 실제 유명인 얼굴 재현 · AI 유명인 대체 이미지를 증거 위치에 자동 배치.

## 10. 화면 상태 흐름(SITE)
탭 진입 → `GET stories`(앱 꺼짐 → 안내 · 구버전 → 업데이트 안내) → 필터 · 정렬(로컬) → 카드 [상세] → `POST story` → 구획 표시 → [제목 만들기] `titles` → 조합 선택 `select` → [이미지/썸네일] `visual` → [AI 이미지 생성] 프롬프트 미리보기 · 수정 → `image` → [원고 만들기] `draft` → 복사 → [발행 기록] `publish` → [성과 입력] `performance` → [성과학습] `calibration`. 모든 AI 버튼은 진행 · 실패 사유 · 재시도.

## 11. 테스트 계획
| 층 | 내용 |
|---|---|
| APP 단위(vitest) | first_seen · delta · acceleration · persistence · 묶음 · 각도 · 델타 · fun gap 근거 · payoff 중복 제거 · no-search 게이트 · tellability 폴백 · 상태/창 · 이미지 전략 · 썸네일 준비도 · 결측 · 원천 중복 · 제목 분류 · 원고 검사 · 보정 n 게이트 · 재개 시각 해석 · 코덱스 이미지 실행기(가짜 spawn) · 브리지 경로 검증 |
| APP 통합 | **실제 수집 회차로 만든 스냅샷 표본** → 스토리 → 제목/이미지 계획 → 원고 페이로드, 성과 → 보정 |
| APP 실측 | 실제 원천으로 수집기 회차 실행(이 PC 네이버 키), 구독 에이전트로 제목 · 원고 1회 |
| SITE | 모델 단위 · 계약(탭 등록 · 브리지 전용 · 금지어 · 미측정) · 빌드 · 숨은 Chromium 렌더(브리지를 테스트 브리지로 우회, 모바일 폭 포함) |
| 회귀 | APP 게이트 전체 · SITE 워크플로 node --test 전체 · 이슈 탭 렌더 스모크 |

## 12. 롤백
- SITE: 탭 커밋 되돌리기(탭 한 줄 제거로도 숨김). 이슈 탭 코드 무변경이라 영향 없음.
- APP: 설정 `enabled=false` → 수집 중지. 코드 되돌리기 = homefeed 폴더 · 브리지 경로 제거. 데이터 = `%APPDATA%\leword\homefeed` 삭제(다른 파일 무관).

## 13. 모르는 것(known unknowns)
1. 코덱스 내장 image_gen 실제 생성 — 이 PC 계정 한도로 **09-21 10:24 전엔 실측 불가**. 무료 계정은 이미지 생성이 막힐 수 있음(공개 자료).
2. 네이버 홈피드 알고리즘 — 모름(가정하지 않음). 창 · 상태 임계값은 전부 **보정 전 가설값**.
3. 글별 추천 유입 · 검색 유입 — 읽는 코드 없음(로그인 통계). 1차는 **수동 입력**.
4. 기사 사진 권리 — 판정 불가 → 기본 `rights_check_required`. 워터마크는 감지하지 않으면 `unknown`.
5. Signal.bz 20~30분 지연 → OPENING 판정은 원천 지연만큼 늦는다(화면에 원천 시각 표기).
6. 앱이 꺼져 있던 구간은 이력이 비고, 그 구간을 걸친 delta 는 `미측정`.
