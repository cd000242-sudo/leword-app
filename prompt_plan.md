# LEWORD 끝판왕 개선 플랜 v1.0

> 작성일: 2026-04-03
> 상태: 사용자 확인 대기

---

## 현황 요약

### 이번 세션에서 완료한 것 (백엔드)
- MDP Engine v3.0: 5차원 가중 기하평균 스코어링, SERP 신호 반영, C/D 필터링
- Math.random() 점수 오염 25곳 제거 (PRO/Lite/RPM/Premium/Rising 전부)
- profit-engine CPC DB 통합, 다중 게이트 등급 판정
- 모든 기능에 grade, goldenReason, estimatedMonthlyRevenue, isBlueOcean 필드 추가

### 사용자가 아직 못 보는 것 (UI 미반영)
- MDP 결과: grade/goldenReason/월수익/블루오션 필드 표시 안 됨
- Rising Keywords: goldenScore/grade/opportunity 표시 안 됨
- 전체적으로 백엔드 개선이 UI에 도달하지 않은 상태

### 보안 긴급 이슈
- CSP 미설정 (XSS → 시스템 레벨 접근 가능)
- 비밀번호 평문 저장 (license.json)
- 라이선스/업데이트 모달: nodeIntegration=true

### 구조적 부채
- keywordMasterIpcHandlers.ts: 8,595줄 / 74개 핸들러 단일 파일
- TypeScript strict: false (any 전파)

---

## Phase 1: UI에 황금키워드 개선 데이터 반영 (체감 최대)

> 예상: 2세션 | 파일: ui/keyword-master.html

### 1-1. MDP 결과 테이블 (원클릭 + 키워드 조회)

**현재:** 10컬럼 (순위/키워드/SERP/CVI/CPC/검색량/문서수/황금비율/난이도/검색)
**목표:** 등급 뱃지 + 황금 사유 + 월수익 추정 추가

변경할 함수: `displayGoldenResults()` (line 3188)

```
변경 사항:
- 황금비율 컬럼 → "등급 + 비율" 복합 컬럼으로 변경
  - SSS: 빨강(#dc2626) 뱃지, SS: 주황(#ea580c), S: 초록(#22c55e), A: 파랑(#3b82f6), B: 노랑(#fbbf24)
- 난이도 컬럼 → "판정" 컬럼으로 변경
  - goldenReason 한 줄 표시 (예: "검색 5,200 대비 문서 320개 — 블루오션")
- 테이블 아래에 요약 카드 추가:
  - SSS/SS/S 개수, 블루오션 개수, 평균 예상 월수익
```

### 1-2. Rising Keywords 모달

**현재:** 순위/키워드/검색량만 표시
**목표:** grade 뱃지 + opportunity 메시지 추가

변경할 함수: 실시간 급상승 키워드 렌더링 (line 14978)

```
변경 사항:
- 검색량 옆에 grade 뱃지 추가 (SSS/SS/S/A/B)
- opportunity 텍스트 표시 ("폭발 성장 — 지금 선점하면 독점 가능")
- goldenScore 프로그레스 바
```

### 1-3. Category Longtail 카드

**현재:** grade/비율/검색량/문서수/경쟁도/상위노출기간/황금키워드 사유
**상태:** 이미 풍부함 — 개선된 데이터 기반 등급이 자동 반영됨 (백엔드 변경만으로 완료)
**추가:** 등급 색상 매핑이 새 데이터와 일치하는지 확인

### 1-4. PRO Traffic 카드

**현재:** 매우 풍부한 표시 (등급/모니터링/전략/수익화 등)
**상태:** 백엔드에서 totalScore/grade가 데이터 기반으로 변경되어 자동 반영됨
**추가:** 수정 사항 없음 (이미 UI가 grade 필드를 렌더링 중)

---

## Phase 2: 보안 긴급 수정 (출시 전 필수)

> 예상: 1세션 | 파일: ui/keyword-master.html, src/main.ts, src/utils/licenseManager.ts

### 2-1. CSP 강화

**현재:** `default-src * 'unsafe-inline' 'unsafe-eval'` (사실상 CSP 없음)

```
변경:
default-src 'self';
script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.tailwindcss.com;
style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
connect-src 'self' https://openapi.naver.com https://script.google.com https://*.naver.com;
img-src 'self' data: https:;
font-src 'self' https://cdn.jsdelivr.net;
```

주의: `'unsafe-inline'`은 인라인 스타일/이벤트핸들러 때문에 당장 제거 불가.
`'unsafe-eval'`은 tailwindcss CDN이 사용 → 빌드타임 tailwind로 전환 시 제거 가능.

### 2-2. 비밀번호 평문 저장 제거

**현재:** license.json에 `userPassword` 평문 저장

```
옵션 A (권장 — 최소 변경): 서버 인증 후 토큰 발급, userPassword 저장 안 함
옵션 B (대안): electron safeStorage API로 암호화 저장
옵션 C (즉시 적용 가능): license.json 저장 시 userPassword 필드 제거,
  재인증 시 사용자에게 다시 입력 요청
```

### 2-3. 라이선스/업데이트 모달 보안

**현재:** `nodeIntegration: true, contextIsolation: false`

```
변경:
- 라이선스 모달 → preload 스크립트 기반으로 전환
- 업데이트 모달 → IPC 메시지 기반으로 전환
- 두 모달 모두 nodeIntegration: false, contextIsolation: true
```

---

## Phase 3: IPC 핸들러 모듈 분리

> 예상: 1세션 | 파일: src/main/keywordMasterIpcHandlers.ts → 6개 파일

### 분리 대상 (8,595줄 → 6개 파일)

| 새 파일 | 핸들러 수 | 예상 줄수 | 내용 |
|---------|:---------:|:---------:|------|
| `handlers/keyword-discovery.ts` | 17 | ~2,500 | find-golden, trending, realtime, rising |
| `handlers/keyword-analysis.ts` | 10 | ~1,500 | competition, rank, RPM, blog-index, flow |
| `handlers/premium-hunting.ts` | 8 | ~1,800 | PRO traffic, timing-gold, infinite, niche |
| `handlers/schedule-dashboard.ts` | 12 | ~800 | schedules, notifications, groups, dashboard |
| `handlers/config-utility.ts` | 15 | ~1,200 | env, api-keys, settings, tutorial, export |
| `handlers/license-handlers.ts` | 4 | ~500 | license-info, register, refresh, premium-access |

### 진행 방식

```
1. src/main/handlers/ 디렉토리 생성
2. 각 그룹의 핸들러를 새 파일로 이동
3. 공통 의존성(licenseManager, EnvironmentManager 등)은 각 파일에서 import
4. keywordMasterIpcHandlers.ts → 각 모듈의 setup 함수를 호출하는 오케스트레이터로 변경
5. 빌드 검증
```

### 오케스트레이터 패턴

```typescript
// keywordMasterIpcHandlers.ts (최종 ~50줄)
import { setupKeywordDiscoveryHandlers } from './handlers/keyword-discovery';
import { setupKeywordAnalysisHandlers } from './handlers/keyword-analysis';
import { setupPremiumHuntingHandlers } from './handlers/premium-hunting';
import { setupScheduleDashboardHandlers } from './handlers/schedule-dashboard';
import { setupConfigUtilityHandlers } from './handlers/config-utility';
import { setupLicenseHandlers } from './handlers/license-handlers';

export function setupKeywordMasterHandlers() {
  setupKeywordDiscoveryHandlers();
  setupKeywordAnalysisHandlers();
  setupPremiumHuntingHandlers();
  setupScheduleDashboardHandlers();
  setupConfigUtilityHandlers();
  setupLicenseHandlers();
}
```

---

## Phase 4: TypeScript strict 점진적 적용

> 예상: 2세션 | 파일: tsconfig.json + 전체 소스

### 단계적 활성화 (한 번에 strict: true 하면 수백 개 에러)

```
Step 1: strictNullChecks: true (가장 임팩트 큼)
  → null/undefined 관련 에러 수정
  
Step 2: noImplicitAny: true
  → any 타입에 명시적 타입 부여
  
Step 3: strictFunctionTypes: true
  → 함수 파라미터 타입 검사 강화

Step 4: strict: true (나머지 모두 활성화)
```

### 진행 방식

```
1. tsconfig.strict.json 별도 생성 (점진적 검사용)
2. Step별로 옵션 추가 → 에러 목록 확인 → 수정
3. 각 Step 완료 후 tsconfig.json에 반영
4. 빌드 검증
```

---

## Phase 5: PRO 헌터 profit-engine 완전 통합

> 예상: 1세션 | 파일: src/utils/pro-traffic-keyword-hunter.ts

### 현재 상태
- PRO 헌터는 이미 `calculateProfitGoldenRatio()`를 import하고 사용 중
- 하지만 모든 결과에 적용되지 않음 (일부 경로에서 skip)

### 개선 사항

```
1. huntProTrafficKeywords()의 모든 결과 경로에 profit-engine 적용
   - realtime 모드, category 모드, season 모드 전부
   
2. profitAnalysis 필드가 없는 결과에 자동 보강
   - searchVolume/documentCount가 있으면 calculateProfitGoldenRatio() 호출
   
3. 결과 정렬에 profitGoldenRatio 가중치 추가
   - 현재: goldenRatio > explosion > intent > revenue > CPC > difficulty
   - 변경: profitGoldenRatio를 explosion과 동급으로
```

---

## 의존성 그래프

```
Phase 1 (UI) ← Phase 3 (모듈 분리)와 독립 → 병렬 가능
Phase 2 (보안) ← 독립 → 언제든 가능
Phase 3 (모듈 분리) ← Phase 4 (strict)보다 먼저 (파일 분리 후 strict 적용이 쉬움)
Phase 4 (strict) ← Phase 3 완료 후
Phase 5 (PRO 통합) ← Phase 1 완료 후 (UI에서 확인 가능해야)
```

---

## 추천 실행 순서

| 세션 | Phase | 이유 |
|:----:|:-----:|------|
| **다음** | **Phase 1** (UI 반영) | 사용자 체감 즉시. 백엔드 이미 완료 |
| 그다음 | **Phase 2** (보안) | 출시 전 필수. CSP + 비밀번호 |
| 3번째 | **Phase 3** (모듈 분리) | Phase 4의 선행 조건 |
| 4번째 | **Phase 4** (strict) | 파일 분리 후 적용 |
| 5번째 | **Phase 5** (PRO 통합) | UI 확인 가능한 상태에서 |

---

## 리스크

| 리스크 | 확률 | 영향 | 대응 |
|--------|:----:|:----:|------|
| CSP 강화 시 기존 기능 깨짐 | 높음 | 중간 | 단계적 적용, 화이트리스트 점진 축소 |
| 모듈 분리 시 순환 의존성 | 중간 | 중간 | 공통 모듈(shared.ts) 분리 |
| strict 활성화 시 에러 폭주 | 높음 | 낮음 | Step별 점진 적용 |
| UI 변경 시 인라인 스타일 충돌 | 낮음 | 낮음 | 기존 패턴 유지 |
| 비밀번호 저장 방식 변경 시 기존 사용자 재인증 | 확실 | 중간 | 마이그레이션 로직 + 안내 메시지 |

---

## 성공 기준

- [ ] Phase 1: MDP 결과에 등급 뱃지/황금사유/월수익 표시됨
- [ ] Phase 2: CSP 도메인 화이트리스트, userPassword 미저장
- [ ] Phase 3: keywordMasterIpcHandlers.ts 100줄 이하
- [ ] Phase 4: tsc --strict --noEmit 에러 0개
- [ ] Phase 5: PRO 결과 100%에 profitAnalysis 포함

---

**확인 대기 중:** 이 플랜으로 진행할까요?
