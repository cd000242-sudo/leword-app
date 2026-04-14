# 지식인 황금질문 — Phase 0 베이스라인

> 측정일: 2026-04-14
> 환경: Windows 11, Node.js (ts-node --transpile-only), Puppeteer + Stealth
> 측정 스크립트: `scripts/bench-kin.ts`, `scripts/grade-distribution.ts`
> 원본 데이터: `baseline/bench.json`, `baseline/grade-distribution.json`

---

## 1. 성능 (bench.json)

**대상**: `getPopularQnA()` 5회 반복 (무료 탭, 메인 + 조회순)

| 지표 | 값 |
|---|---|
| 성공/실패 | 5/0 |
| min | 39.4s |
| **p50** | **40.2s** |
| **p95** | **41.4s** |
| max | 41.4s |
| avg | 40.2s |
| 평균 크롤 | 15개 |
| 평균 황금 | 15개 |
| 평균 RSS 증가 | 0.1 MB |

### 해석
- **목표 ≤10s (p95) 대비 4배 느림** → 병렬화 필수 (Phase 4 확정)
- RSS 증가 ~0 MB → 메모리 누수 없음, Page Pool 도입 여력 충분
- 차단/오류 없음 → anti-bot 리스크 현재는 낮음
- **실제 크롤 수 15개** (의도 30개에서 축소) — 필터가 타이트함. Phase 1에서 원인 파악 필요

---

## 2. 등급 분포 (grade-distribution.json)

**샘플**: 15개 (getPopularQnA 15 + getRisingQuestions 0)

| 등급 | 개수 | 비율 | 평균점수 | 평균조회 | 평균답변 |
|---|---|---|---|---|---|
| SSS | 0 | **0%** | - | - | - |
| SS | 1 | 6.7% | 75 | 56 | 1 |
| S | 13 | 86.7% | 52.3 | 764 | 5.8 |
| A | 1 | 6.7% | 40 | 1648 | 18 |
| B | 0 | 0% | - | - | - |
| C | 0 | 0% | - | - | - |

**전체 평균 점수**: 53

### 🚨 핵심 발견

1. **SSS 등급이 구조적으로 불가능**
   - 현재 임계: `score ≥ 120 = SSS` (`v3.ts:1400`)
   - 실제 분포: **최대 점수 75, 평균 53**
   - **→ 기존 코드에서 SSS는 단 한 번도 나올 수 없음**
   - DoD 목표 (SSS 5~15%) 대비 **FAIL**

2. **S 등급에 86.7% 집중**
   - 임계값이 현실 분포와 괴리 → 등급이 사실상 무의미
   - Phase 1 다중 게이트 도입의 직접적 근거

3. **getRisingQuestions가 0개 반환**
   - "24시간 이내" 필터가 너무 타이트
   - 로그: `[STEP 1] ✅ 오늘의 질문 0개!`
   - Phase 1 작업 중 필터 완화 검토 필요

4. **이상 신호**: A 등급 샘플 (조회 1648, 답변 18, 점수 40)
   - 높은 조회수인데 낮은 점수 → 답변수 페널티 과도
   - 가중치 튜닝 포인트

---

## 3. API 쿼터 & 차단 리스크

| 항목 | 현황 | 비고 |
|---|---|---|
| 네이버 검색광고 API | 설정 완료 | Phase 0에서는 미사용 |
| 크롤링 차단 | 5회 연속 성공 | 현재 리스크 낮음 |
| Puppeteer 충돌 | 없음 | 사용자 확인 완료 |

**Phase 2 진입 전 추가 측정 필요 항목**:
- 검색광고 API 일일 한도 (현재 계정)
- 블로그지수 핸들러 호출 한도
- 4 page pool 동시 요청 시 차단 여부

---

## 4. DoD 대시보드 (현황 → 목표)

| DoD 항목 | 현재 | 목표 | 상태 |
|---|---|---|---|
| SSS 비율 | **0%** | 5~15% | 🔴 FAIL |
| 등급 안정성 | 미측정 | 100% | ⚪ 미측정 |
| p95 크롤 시간 | **40.2s** | ≤10s | 🔴 FAIL (4x) |
| 셀렉터 hit율 | 미측정 | ≥95% | ⚪ 미측정 |
| 빈 catch | 6개 이상 | 0 | 🔴 FAIL |
| 게이트 테스트 커버리지 | 0% | ≥80% | 🔴 FAIL |
| 검색광고 일일 호출 | - | ≤200/사용자 | ⚪ 미적용 |

---

## 5. Phase 1-4 작업 우선순위 재검증

베이스라인 결과에 따른 우선순위 확정:

### 🔥 즉시 (Phase 3 → Phase 1)
1. **Phase 3 (관측성)** — 빈 catch 6개, NaN 방어 분산 → 이후 Phase의 디버깅 토대
2. **Phase 1 (다중 게이트)** — **SSS 0% 문제 직접 해결**. 가장 큰 품질 개선

### ⚡ 중기 (Phase 4)
3. **Phase 4 (병렬화)** — 40s → 10s. Page Pool 4개 + 캐시

### 🧪 말기 (Phase 2)
4. **Phase 2 (신호 보강)** — API 쿼터 리스크 가장 큼, 마지막

---

## 6. 측정 재현 방법

```bash
# 성능 벤치마크 (5회 반복, ~3.5분)
npx ts-node --transpile-only scripts/bench-kin.ts

# 등급 분포 (1회, ~1분)
npx ts-node --transpile-only scripts/grade-distribution.ts
```

출력:
- `baseline/bench.json`
- `baseline/grade-distribution.json`

모든 PR은 위 두 명령 실행 결과를 before/after 표로 본문에 첨부할 것.
