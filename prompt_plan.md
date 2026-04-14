# 지식인 황금질문 SSS 승급 — 보완 계획 v2

> 작성일: 2026-04-14
> 상태: 사용자 승인 완료
> 총 예상: 19-25h (2.5-3 영업일)

---

## 0. 완료 정의 (DoD) — 정량 기준

| 영역 | 측정 항목 | 목표값 | 측정 방법 |
|---|---|---|---|
| 품질 | SSS 비율 | 5~15% (인플레이션 방지) | 100개 샘플 분포 |
| 품질 | 등급 안정성 | 동일 질문 재계산 시 등급 변동 0% | 결정적 함수 검증 |
| 성능 | 30개 크롤링 | ≤10초 (p95) | `bench-kin.ts` 5회 평균 |
| 신뢰성 | 셀렉터 hit율 | ≥95% | Phase 3 메트릭 |
| 신뢰성 | 빈 catch | 0개 | grep 검증 |
| 테스트 | 게이트 함수 커버리지 | ≥80% | jest --coverage |
| API | 검색광고 일일 호출 | ≤사용자당 200회 | rate-limiter 카운터 |

---

## Phase 0 — 베이스라인 측정 (1-2h)

**목적**: 비교 기준 확보. 이게 없으면 "개선했다" 주장 불가.

### 산출물
1. `scripts/bench-kin.ts` — 30개 질문 크롤링 시간/메모리 측정 (5회 평균)
2. `scripts/grade-distribution.ts` — 현재 등급 분포 (100개 샘플) JSON 덤프
3. `BASELINE.md` — 현재 수치 + 검색광고 API 일일 호출량 추정

### 완료 기준
- 베이스라인 수치 3종 모두 기록
- 이후 PR 본문에 "before/after" 비교 표 의무 첨부

---

## Phase 1 — 다중 게이트 등급 (4-5h, 복잡도 中)

### 알고리즘 결정 단계 (0.5h 선행)
**기하평균 vs 가중 산술평균 — 100개 샘플 A/B**:
- 기하평균: 한 차원 약하면 강하게 페널티 (MDP 방식)
- 가중 산술: "답변 0개" 같은 강한 단일 신호 보존
- 가설: 지식인 도메인에선 "답변수=0"이 dominant → **가중 산술 + 강한 게이트** 유력

→ 두 방식으로 100개 샘플 등급 분포 비교 후 채택.

### 변경 대상
- `naver-kin-golden-hunter-v3.ts:1400` 단일 임계 제거
- `naver-kin-golden-hunter-v3.ts:1329` / `naver-kin-crawler.ts:581-612` 분산 가중치
- 신규 `naver-kin-golden-config.ts` 단일 소스

### SSS 게이트 (잠정)
```
SSS = score≥90 AND view≥500 AND answer≤2
      AND ≤72h AND !adopted AND view/answer≥200
```
샘플 분포 보고 SSS 비율 5~15% 되도록 임계값 튜닝.

### 테스트 매트릭스
- 게이트 경계값 단위 테스트: 등급마다 "정확히 통과" / "1포인트 부족"
- 결정성 테스트: 동일 입력 100회 → 동일 출력
- 마이그레이션 테스트: 기존 100개 샘플 등급 변화 diff 출력

**완료 기준**: SSS 비율 + 등급 안정성 + 커버리지 80% 충족

---

## Phase 2 — 신호 보강 (6-8h, 복잡도 中上)

### 변경 대상
- `v3.ts:1322-1330` enrichment
- `profit-golden-keyword-engine.ts` CPC DB 재사용
- `config-utility.ts` 검색광고 IPC

### 신호 4종
1. **월 검색량** — 검색광고 API 배치(10개), 결과 1h 캐시
2. **CPC** — `estimateCPC()` + 카테고리 어댑터
3. **블로그 문서수** — 기존 핸들러
4. **시간당 증가율** — docId 1h TTL diff

### 보완
- **API 쿼터 사전 검증**: Phase 0에서 일일 한도 확인 → 사용자당 일일 200회 rate-limiter
- **백그라운드 워밍**: 시간당 증가율 1차 호출 중립값 50 문제 → 앱 시작 시 인기 카테고리 30개 프리페치 (5분 후 첫 사용자는 정확한 값)
- **Degraded mode**: API 쿼터 초과/차단 시 → 사용 가능한 신호만으로 점수 계산, UI에 "제한 모드" 배지

**완료 기준**: 4개 신호 동작 + degraded mode 동작 + 쿼터 카운터 동작

---

## Phase 3 — 관측성 (3-4h, 복잡도 下) — **최우선**

### 변경 대상
- `v3.ts:494, 499` 빈 catch
- `crawler.ts:441` 폴백 셀렉터
- `v3.ts:1392-1397` NaN 방어

### 작업
1. 빈 catch → 구조화 로그 `{sessionId, url, step, error}`
2. 셀렉터 hit/miss 메트릭 → 결과 객체 포함 → 95% 이하 시 알림
3. **NaN 상향 이동**: `v3.ts:1322` enrichment에서 `Number(x)||0` 정규화 → 하류 `safeScore` 제거
4. **anti-bot 차단 감지**: 연속 5회 빈 응답 → 즉시 중단 + degraded mode 진입

**완료 기준**: `grep "catch\s*{}"` = 0, 셀렉터 메트릭 노출, sessionId 모든 로그 prefix

---

## Phase 4 — 성능 (5-6h, 복잡도 中)

### 변경 대상
- `v3.ts:1221-1344` 순차 루프 + `:1341` 100ms sleep

### 작업
1. **Page Pool 4개** + `p-limit(4)`
2. **docId 1h 캐시** (Phase 2와 공유)
3. `setTimeout 500ms` → `waitForSelector(timeout:1500)`
4. 글로벌 rate-limiter (8 req/s) + UA jitter

### 보완
- **메모리 모니터링**: 풀 4개 ≈ 힙 +400MB. 베이스라인 대비 임계
- **anti-bot 폴백**: 차단 감지 → 풀 크기 1 자동 축소 → 그래도 차단이면 캐시-only
- **벤치마크 자동화**: `npm run bench:kin` → JSON → PR 본문 자동 첨부

**완료 기준**: bench p95 ≤10s, 메모리 증가 ≤500MB, 차단 시뮬레이션 통과

---

## 우선순위 & 머지 전략

```
Phase 0 → Phase 3 → Phase 1 → Phase 4 → Phase 2
```

| PR | Phase | Feature Flag | 롤백 기준 (정량) |
|---|---|---|---|
| #0 | 0 (베이스라인) | 없음 | 측정 스크립트만 |
| #1 | 3 (관측성) | 없음 | 셀렉터 hit율 <90% |
| #2 | 1 (등급) | `KIN_GRADE_V2` | SSS 비율 >20% or <2% |
| #3 | 4 (성능) | `KIN_POOL_V2` | p95 >15s or 메모리 >700MB |
| #4 | 2 (신호) | `KIN_SIGNALS_V2` | API 쿼터 >80% or 차단 발생 |

---

## 핵심 리스크

| 리스크 | 완화책 |
|---|---|
| 기하평균 부적합 가능성 | Phase 1에서 100개 샘플 A/B 후 결정 |
| 시간당 증가율 첫 호출 부정확 | 백그라운드 워밍 + UI "데이터 수집 중" 표시 |
| 검색광고 API 쿼터 폭발 | Phase 0 사전 측정 + 사용자당 일일 한도 |
| anti-bot 차단으로 기능 사망 | 3중 폴백: 풀 축소 → 캐시-only → degraded mode |
| 등급 분포 인플레이션 | DoD에 SSS 5~15% 강제, 벗어나면 자동 롤백 |
| 프론트 호환성 (`ui:13365`) | Phase 0에서 grep 검증, 등급 문자열 유지 |

---

## 핵심 파일

- `src/utils/naver-kin-golden-hunter-v3.ts` (메인 엔진)
- `src/utils/naver-kin-crawler.ts` (Puppeteer)
- `src/utils/mdp-engine.ts` (가중 기하평균 참조)
- `src/utils/profit-golden-keyword-engine.ts` (CPC DB 재사용)
- `src/main/handlers/config-utility.ts:707-763` (IPC)
- `ui/keyword-master.html:13365` (openKinGoldenModal)

---

## 이전 계획

<details>
<summary>v1.0 — LEWORD 끝판왕 개선 플랜 (2026-04-03)</summary>

# LEWORD 끝판왕 개선 플랜 v1.0

> 작성일: 2026-04-03
> 상태: 사용자 확인 대기

## 현황 요약

### 이번 세션에서 완료한 것 (백엔드)
- MDP Engine v3.0: 5차원 가중 기하평균 스코어링, SERP 신호 반영, C/D 필터링
- Math.random() 점수 오염 25곳 제거 (PRO/Lite/RPM/Premium/Rising 전부)
- profit-engine CPC DB 통합, 다중 게이트 등급 판정
- 모든 기능에 grade, goldenReason, estimatedMonthlyRevenue, isBlueOcean 필드 추가

### 사용자가 아직 못 보는 것 (UI 미반영)
- MDP 결과: grade/goldenReason/월수익/블루오션 필드 표시 안 됨
- Rising Keywords: goldenScore/grade/opportunity 표시 안 됨

### 보안 긴급 이슈
- CSP 미설정, 비밀번호 평문 저장, 라이선스/업데이트 모달 nodeIntegration=true

### 구조적 부채
- keywordMasterIpcHandlers.ts: 8,595줄 / 74개 핸들러 단일 파일
- TypeScript strict: false

## Phase 1: UI에 황금키워드 개선 데이터 반영
## Phase 2: 보안 긴급 수정 (CSP, 비밀번호, 모달 보안)
## Phase 3: IPC 핸들러 모듈 분리 (8,595줄 → 6개 파일)
## Phase 4: TypeScript strict 점진적 적용
## Phase 5: PRO 헌터 profit-engine 완전 통합

(전체 내용은 git history 참조)

</details>
