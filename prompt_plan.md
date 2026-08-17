# 황금 헤드 선점 파이프라인 + 시기 캘린더 + 빈 프레임 제목 생성

> 작성일: 2026-08-16
> 상태: **사용자 승인 완료 (2026-08-16) / Phase 0 진행 중**
> 복잡도: MEDIUM-HIGH — 총 4일 안팎
> 이전 플랜(황금키워드 우월성 증명·서버 제품 트랙)은 `prompt_plan.archive.md`로 이동. 그 트랙의 게이트·상태는 그대로 유효하다.

## 방향 (사장님 확정)

- 상위노출이 되면 홍보·링크가 필요 없다. 보드의 존재 이유는 **상위노출 가능한 키워드를 시기별로** 내놓는 것.
- 아무도 안 쓰는 빈자리(무명 브랜드·일정 쪼가리)가 아니라, **수요 검증된 황금 헤드 키워드에서 출발해 파생 확장**하고 그중 이길 수 있는 변형을 고른다.
- 최종 병목은 **제목**: `키워드(앞자리) + 검색량 있는 파생 + 1페이지에 없는 프레임의 후킹`. 제품이면 `제품명 + 구매욕구 후킹`(홈판형). 제목부터 역방향 설계한다.
- 후킹은 낚시 금지 — 본문이 지킬 수 있는(파생 키워드에 근거 있는) 프레임만.
- 추론 최소화 원칙: 시기는 24개월 실측 시계열의 산술, 상위노출 판정은 판례 대조(같은 체급이 이미 1페이지에 있는가). LLM 추측으로 판정하지 않는다.

## 조사로 확정된 사실 (2026-08-16, 탐색 에이전트 2기 실측)

1. **시기 판정은 이미 구현돼 있고 배선이 끊겨 있다.** `src/utils/keyword-demand-shape.ts:129 classifyDemandShape()`가 24개월 데이터랩 창으로 `monthsToPeak`(:187)·`timing`(:196, seasonTiming)을 계산하지만, `scripts/preemption-candidates.js:468`이 `trend = {type, label, evidence}`로 두 필드를 버린다. 그래서 보드의 timing은 100% 빈 값(금요일 8/14 회차 34행 실측 0건). 5년 시계열이 없어서가 아니다.
2. `scripts/preemption-board-batch.js:86-107 loadCandidates()`가 `trendShape`를 복사하지 않아 항상 null. 발행기의 `shapeFromLabel` 폴백으로 간신히 연명.
3. `src/utils/preemption-gate.ts:483` byTier 초기화에 `golden-ratio` 키 누락 → 보드 `tierTotals["golden-ratio"]`가 NaN→null.
4. **SERP 제목 10개를 파싱하고 3개만 보관** — `src/utils/serp-winnability.ts:160 extractTitles()`(10개) → `:198 topTitles = titles.slice(0,3)`. 발행본에는 topTitles 전면 제외. 빈 프레임 분석 원료가 공짜로 흐르는데 버려진다. `findOpenSlot()`(preemption-gate.ts:206)도 3개만 훑어 4위 이하 빈자리를 못 본다.
5. **씨앗은 100% 하드코딩** — `src/utils/blog-topic-coverage.ts:63 SEED_TERMS`(32주제). 확장은 `preemption-candidates.js:204-280` 인라인 2단(검색광고 연관 → 자동완성).
6. 제목 자산 5개가 파편으로 존재(통합 인터페이스 없음): 룰 템플릿 `mass-collection/keyword-title-generator.ts`, SERP 제목 프레임 분석 `keyword-competition/title-analyzer.ts`(analyzeTitleStrategy), CTR 예측+LLM `pro-hunter-v12/title-ctr-predictor.ts`, 규칙 이슈 제목 `issue-title-suggester.ts`, **Ollama+환각가드 4중 `llm-title-writer.ts`(테스트 있음, SEO 28~40자/홈판 20~38자 규격)**.
7. 규칙→AI 2단 폴백 레퍼런스: `shopping-purchase-angle.ts`(도메인 앵글 14종) + `config-utility.ts:1388 shopping-connect-ai-angle`.
8. 상위 블로그 제목 수집 최적 래퍼: `top-blog-analyzer.ts:550 fetchNaverBlogSearchResults`. `naver-blog-api.ts:738 takeRecentBlogTitles`는 후보 사전선별(preemption-candidates.js:398-408)에 사용 중.
9. 데이터랩 최장 창은 24개월(keyword-demand-shape.ts:292). 성수기 임박 판정에 충분(주석 :326-331에 근거 명시).

## Phase 0 — 죽은 배선 복구 (반나절) ← 완료 (4cc0df25, 2026-08-17 push)

월요일 회차(8/18 07:00 KST)부터 시기 라벨이 실물로 붙는 것이 목표. 기존 방침대로 특성화 테스트 먼저.

- [ ] 특성화 테스트: 현행 후보/보드 JSON 필드 계약 고정 (`src/utils/__tests__/` 신규)
- [ ] `preemption-candidates.js:468` — `monthsToPeak`·`timing` 필드 복사 추가 (시기 판정 부활)
- [ ] `preemption-board-batch.js:86-107` — `trendShape` 복사 추가
- [ ] `preemption-gate.ts:483` — `golden-ratio` 집계 초기화 (NaN 수정)
- [ ] `serp-winnability.ts:198` — topTitles 3→10개 보존 (BD 추가 비용 0). board.json 원장에만 저장, 발행본 노출은 Phase 3에서 결정
- [ ] `findOpenSlot()` 10개 기준 재검토 — 빈자리 탐색 범위 확대의 게이트 영향 확인 후 적용 여부 결정
- [ ] 검증: 관련 테스트 전체 + `preemption-board-workflow.test.ts` 통과, 소형 드라이런으로 timing 비어있지 않음 실측

## Phase 1 — 제목 대장간 `src/utils/title-forge/` (1.5일)

역방향 설계의 기준점. 파편 5개를 통합하지 않고(수술적 변경 원칙) 기존 부품을 import해 조립.

- [ ] 입력 계약 정의: `{ keyword, derivedKeywords: {kw, volume}[], serpTitles: string[10], intent, timing, isProduct }`
- [ ] 프레임 분석기: 상위 10개 제목 → 프레임 분류(후기/비교/방법/실패/가격/일정/추천…) → 포화 프레임 배제, 빈 프레임 채택. `title-analyzer.ts analyzeTitleStrategy` 확장
- [ ] 생성 규칙(SEO형): 키워드 앞자리 고정 + 검색량 있는 파생 1개 삽입 + 빈 프레임 후킹, 28~40자
- [ ] 생성 규칙(홈판형): 감정 자극 허용 20~38자. 제품이면 `제품명 + 구매욕구 후킹` — `shopping-purchase-angle.ts` 도메인 앵글 14종을 제목 규격으로 확장
- [ ] 낚시 가드: 파생 키워드·실측 사실에 근거 없는 프레임 차단
- [ ] 실행 모드: CI = 순수 규칙만(Ollama 러너에 없음). 데스크톱 = 기존 AI 강화 버튼 패턴(규칙 시드 → `llm-title-writer` 환각가드 경유)
- [ ] 단위 테스트: 규격(길이·키워드 위치)·빈 프레임 선택·낚시 가드·제품 분기

## Phase 2 — 공급원 재편: 황금 헤드 (1일)

- [ ] `SEED_TERMS` 성격 재정의: 검색광고 연관 API로 주제별 검색량 상위 **개념** 키워드 자동 수집, 기존 하드코딩 씨앗은 부트스트랩 유지
- [ ] 역선택 차단 필터 ①: 무명 브랜드 컷 — `BRAND_FAMILIES` 사전 + (고유명사 패턴 & 문서수≪검색량 & 브랜드 접미) 판정
- [ ] 역선택 차단 필터 ②: 유통기한 컷 — 무대인사 일정·편성표·서버점검·재방송 류 패턴
- [ ] 확장 2단(연관→자동완성)은 유지 — 이미 작동
- [ ] 리스크 방어: 드라이런 검수 통과 전까지 기존 씨앗과 병행 운행

## Phase 3 — 시기 캘린더 + 제목 발행 (반나절)

- [ ] `publish-preemption-board.js` 발행 스키마: 시기 그룹(`지금 적기 / N주 후 정점 / 연중 상시`) + 행별 `titles: {seo, home}` 부착 (하위호환 — 필드 추가만)
- [ ] 사이트(naver 레포) 보드 화면: 시기별 묶음 + 제목 2종 표시 (별도 커밋, 스키마 먼저 → 화면 나중)

## Phase 5 — 플랫폼 레인 분리 (사장님 지시 2026-08-17, 보드+데스크톱 동시)

황금키워드 산출물을 용도로 가른다. 쇼핑/상업 키워드는 이 보드의 오염이 아니라
쇼핑 황금키워드 탭의 소관 — 브랜드 꼬리표 문제는 브랜드 판별이 아니라
**상업 레인 라우팅**으로 푼다.

- [x] 공용 판정 모듈 `platform-lane.ts` `judgePlatformLane`: 쇼핑 실측 3중 증거(SERP 쇼핑 구획 / 상품명 카드 2+ / 스마트블록 쇼핑 상위3) 중 하나면 shopping 레인. 광고 수·브랜드명 추측으로는 안 자름(을왕리 펜션 오폭 방지). 애드센스 적합 = 거래형 false / 정보형 true / 불명+CPC 실측 ≥300 true / 그 외 null. vitest 12/12
- [x] 선점보드 배선: candidates 가 버리던 CPC·광고경쟁도 보존(추가 호출 0) → batch 가 **선발 전** 레인 분리(`routedShopping` 원장, 조용히 안 버림) + 행에 `adsenseFit`/`adsenseReason` → publish 통과
- [x] 데스크톱 배선: find-golden-keywords SERP 측정 행에 `platformLane`/`adsenseFit`(추정 CPC 는 판정에 안 씀 — 누수 금지), displayGoldenResults 가 쇼핑 레인 제외+하단 고지, AdSense 배지(미판정은 배지 없음)
- [x] 검증: 월요일 실회차 28행 재판정 — 쇼핑 5행(세라원·페이스타올·케어덴·은나노스텝4·슬로벨라) 정확 라우팅, 오폭 0. 페피릴리프·포유는 구획 미측정이라 원칙대로 잔류(다음 회차부터 포착). 빌드 0오류·신규 vitest 87/87·ui-count 62/62
- [ ] 사이트(naver 레포) 화면: adsenseFit 배지·routedShopping 표시 (스키마는 이미 나감)
- [ ] CPC 실측이 쌓이면 ADSENSE_CPC_FLOOR(300원) 분포 캘리브레이션

## Phase 6 — 레인 화면 재편 (사장님 지시 2026-08-17: 기능별 독립 화면 + 서브·후킹)

- [x] UI 구조안 목업(ui/prototype-lanes-v1.html) 전달 — 허브 4분리(애드센스/네이버/홈판/쇼핑 유지), 홈판 제목=이슈+서브+후킹 3부품
- [x] `subkeyword-forge.ts`: 문제해결형 서브 3 — 하드코딩 접미사 금지, 실측 확장 중 프레임 선별(어절 공유·문제형만·검색량순·부족하면 있는 만큼), vitest 5/5
- [x] IPC `forge-lane-insights`(lane-insights.ts 신설): 자동완성 확장(무료)→검색광고 검색량(상위 15개만, 쿼터 절약)→서브 선별+제목 2종. 키 없으면 검색량 null 로 계속
- [x] UI v1: 🧭 황금키워드 레인 카드 + 3탭 모달(발굴 결과 재사용·카테고리 그룹·행별 온디맨드 서브·제목, 홈판은 실시간 검색어 + 같은 조립). 검증: tsc 2종 0오류·vitest 45/45·ui-count 62/62·인라인 스크립트 10블록 vm 파싱 0오류
- [ ] agentCli 이식(리더 네이버 자동화 → LEWORD): 구독 CLI(Claude/Codex/Gemini) 감지+러너 → 추론 체인 ①구독 CLI ②BYOK ③규칙(Ollama 는 신규 기능에서 제외, 기존 마인드맵만 유지)
- [ ] 환경설정 BYOK 입력칸(autocomplete=new-password + 형식 가드 필수 — 크롬 자동완성 사고 재발 방지)
- [ ] 단계별 에이전트 두뇌 훅: 씨앗 선정(회차 전)·판정 해석·폐순환. 어드민 "AI 작업자" 패널 실배선(현재 localStorage 껍데기)
- [ ] 폐순환 적중률: 보드에서 쓴 키워드 → 내 노출 추적 자동 등록 → 회차별 적중률 리포트 (수익화 확률 주장을 실측 숫자로)

## Phase 4 — 검증 (반나절)

- [ ] 신규 테스트 + 기존 특성화 테스트 전체 통과 (증거: 통과 수치)
- [ ] `workflow_dispatch` 실회차 1회 드라이런 → 산출 보드 사람 검수 (헤드 공급 품질 판정)
- [ ] 폐순환(집필→2주 후 순위 실측→게이트 보정)은 범위 밖, 후속 플랜

## 리스크

- **HIGH — 헤드 공급 품질**: 검색광고 연관 상위가 다시 상업 키워드로 쏠릴 수 있음 → 병행 운행 + 드라이런 사람 검수로 닫는다
- **MEDIUM — BD 예산**: 파생 증가 → `--keep` 절단 유지, 예산 상한 불변 (`trim-candidates.js`)
- **LOW — 발행 스키마**: 필드 추가만으로 하위호환 유지, 사이트 화면은 스키마 배포 후 변경

## 진행 기록

- 2026-08-16 금요일(8/14) 회차 검수에서 방향 확정: 35행 중 절반이 무명 브랜드 꼬리표, 5행이 유통기한 며칠짜리 — 게이트 역선택 구조 확인. 탐색 에이전트 2기로 파이프라인·제목 자산 전수 조사 완료. 사용자 플랜 승인.
- 2026-08-17 Phase 0 완료·푸시(4cc0df25): 배선 4곳 수정, 배선 테스트 5건 RED→GREEN, 관련 vitest 91/91. 커밋은 pre-commit 게이트의 **픽스처 달력 부패**(binding-revalidation, 절대날짜가 벽시계 30일 TTL 초과)에 막혔고, 상대 앵커로 수리해 동봉. 월요일 07:00 회차부터 시기 라벨 적용.
- 2026-08-17 Phase 1 완료: `src/utils/title-forge/`(frame-analysis 10프레임 + forge SEO/홈판 2종·제품 분기·낚시 가드), vitest 16/16. 8/14 실회차 스모크에서 파생 없이는 전부 generic — 가드 정상 작동 증명, 제목 품질은 파생 공급 배선(Phase 3)에 의존 확인.
- 2026-08-17 Phase 3 핵심 완료(발행 스키마+배선): 배치가 행에 `titles`(SEO/홈판, 재료=같은 주제 형제 후보·1페이지 제목·시기, 추가 API 0) 부착 — `board-titles.ts` 형제 선별(같은 씨앗 우선→어절 공유). 발행기는 `monthsToPeak`·`timingGroup`(지금 적기/준비 시기/지금 뜨는 중/연중 상시, 실측 산술만)·`titles` 통과. 구세대 board.json 하위호환 스모크 통과(8/14 데이터: 뜨는 중 11·연중 2). 배선 계약 테스트 3건 추가, 신규 vitest 총 96/96. **푸시는 8/18 월요일 회차(Phase 0~2만 탑재) 결과 검증 후** — 회차 직전에 배치 거동을 바꾸지 않는다. 사이트(naver 레포) 화면의 시기 그룹·제목 표시는 남은 작업.
- 2026-08-17 Phase 2 부분 완료: **부패의 뿌리는 확장이 아니라 씨앗**('무대인사 일정'·'재방송 편성표'·'재방송 편성 시간'·'서버 점검 시간'이 씨앗에 있었다) — 4개 제거 + `preemption-supply-guards.ts` 유통기한 컷을 씨앗·후보 양쪽에 배선(문서수 쿼터 전 차단), vitest 13/13. **무명 브랜드 컷은 보류**: 규칙만으로 미지 브랜드를 판별하면 '몬스테라 무름병' 같은 신생 개념어를 오폭한다. batch 의 SERP 구조 실측(광고·쇼핑 섹션 지배)을 근거로 쓰는 설계로 변경하고, 다음 실회차의 10개 제목·구조 데이터로 캘리브레이션 후 적용한다. 황금 헤드 자동 공급(SEED_TERMS 대체)도 유료 API 거동 변경이라 사장님 검수 후 진행.
