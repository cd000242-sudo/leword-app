# LEWORD 황금키워드 우월성 증명 및 제품화 실행 계획

> 작성일: 2026-07-11
> 상태: **전 페이즈 사용자 승인 완료 / Phase 0 완료 / Phase 1D 공급 회복 진행 중 / Phase 2 진입 게이트 미통과**
> 복잡도: 높음
> 예상 기간: 1인 순차 구현 6~8주 + 실제 성과 관찰 28~90일
> 핵심 원칙: **기대 통과와 실제 통과를 구분한다. 테스트·측정 증거 없이는 어떤 단계도 통과로 기록하지 않는다.**

## 현재 진행 기록

- 2026-07-11 Phase 0 완료: SearchAd 소프트 한도 회로 차단, KST 자정 휴면, API curl healthcheck, 워커 heartbeat, 미측정 브라우저 폴백의 가짜 120/120 제거.
- 2026-07-11 Phase 1 구현 완료: 12개 카테고리 정책 SSoT, 부족량·노후도·수율·수요·비용 기반 결정론적 스케줄러, 카테고리 통계, 자동 공급 게이트.
- 2026-07-12 운영 관찰에서 API 프리워밍 Chromium 루트 4개·cgroup PID 1,788 누적을 확인했다. 브라우저 풀 동시 생성 경합 방지, release 정리 완료 전 재할당 차단, 10분 초과 stale lease 강제 회수와 런타임 회귀 테스트를 추가했으며 재배포 후 장시간 안정성 재검증이 필요하다.
- 2026-07-12 운영 보드 정밀도 표본 20개 중 valueGrade C가 12개, C이면서 발행추천이 8개, score 0이 6개로 확인되어 Phase 1 정밀도 게이트를 실패 처리했다. 한국어 붙여쓰기 실측 SSS 보정, A 이상+발행추천 동시 게이트, score 0 재산정, 수량 채우기용 저품질 backfill 차단을 구현했으며 재배포 전 전체 회귀와 재배포 후 표본 재검증이 필요하다.
- 2026-07-12 `b26f5143` 운영 배포 후 C등급·0점·비발행추천 노출은 0건이 됐지만 Verified 22개·활성 카테고리 3개·최대 점유율 59.09%로 공급 게이트는 실패했다. 사람 검수에서 플랫폼 문자열 잔재, 자동조합 의도 충돌, 렌트카/렌터카 의미 중복이 추가 발견되어 플랫폼 잔재 차단, 실수요 정확일치 증거 기반 의도조합 게이트, 보드 의미 중복 제거를 회귀 테스트로 구현했다.
- 최신 변경 기준 빌드, 집중 레이더 회귀, API 통합, `npm run verify:all` 전체 관문 통과. 운영 재배포 후 동일 표본과 공급 게이트를 다시 측정한다.
- 2026-07-12 Phase 1C 공급 회복 구조 구현: `신청하는곳은` 등 문장 잔재를 SearchAd 소모 전에 차단하고, 카테고리 선택은 최근 수율보다 Verified 결손 크기를 절대 우선하도록 변경했다. API 프리워밍은 SearchAd 10,000회에서 멈추고 워커에 12,000회를 예약하며, 읽기 전용 API는 보드/인게스트 파일이 바뀌 때만 재파싱한다. 집중 회귀·대형 레이더·API 통합·`npm run verify:all` 전체 관문은 통과했으며, SearchAd KST 자정 리셋 후 운영 60/10/18%/90% 수치 재검증이 필요하다.
- 2026-07-12 Phase 1C 다중 SearchAd 계정 풀 구현: 추가 계정은 Git·컨테이너 환경변수가 아닌 `/data/searchad-accounts.json` 운영 Secret에서만 읽고, 계정별 남은 쿼터가 가장 큰 계정으로 배치 단위 전환한다. 상태 응답은 Customer ID 뒤 4자리만 노출하며, API·워커 3개 동시 프로세스 300회 쓰기 회귀를 반복 통과하도록 공유 쿼터 원장에 파일 잠금·원자적 저장을 적용했다. 기존 단일 계정 호환, 3계정 자동 전환, 전 계정 소진 후 무호출 안전 종료, Secret 혼입 0건을 검증했다.
- 2026-07-12 운영 다중 계정 첫 실행에서 추가 3계정이 69·69·70회로 균등 분산되어 인증·선택은 성공했지만, SearchAd의 15자 힌트 제한으로 잘려 정확일치가 불가능한 긴 합성 후보가 쿼터를 소비하는 문제를 발견했다. 공통 SearchAd 계층에서 전처리 후 원문 정확성이 보존되지 않는 후보는 HTTP 호출 없이 미측정 처리하는 회귀를 추가하고, 수정 배포 전 워커를 일시 정지했다.
- 2026-07-12 운영 28사이클에서 Verified가 14→15개만 증가한 반면 추가 계정은 각각 약 6,600회 사용됐다. 워커 정지 후에도 약 90초 동안 119회가 증가해 API prewarm의 별도 소모를 확인했고, prewarm을 즉시 중지했다. fresh-context 검증에서 SSS 부족 시 heavy direct가 최대 약 1,800개를 측정하고 80초 fallback 타임아웃 뒤에도 실제 Promise가 계속 실행되는 중첩 누수를 발견했다. 조치: heavy direct 최대 120개, 큐 직접 측정 최대 40개, heavy direct SearchAd 제안 중복 제거, quota 작업 timeout fallback 제거, 15자 초과 제안 시드 무호출, API prewarm 계정당 1,500회·6시간·2대상·동시성 1 제한. 등급·정밀도·실측 게이트는 완화하지 않는다.
- 2026-07-12 운영 health 정확성 보정: API 프로세스 soft ceiling 자체를 1,500으로 낮추면 실제 워커에 남은 22,000회 예산까지 소진으로 오표시되는 문제를 확인했다. API/워커의 계정 가용성 판정은 22,000회로 통일하고, prewarm scheduler에만 별도 1,500회 계정 풀 gate를 적용해 워커 가용성 표시와 prewarm 예약 예산을 분리했다.
- 2026-07-12 `e658b94f` 운영 검증: 4계정 총 soft ceiling 88,000회와 prewarm 전용 1,500회 gate가 분리됐고, prewarm은 1회 skip 후 KST 자정 재시도를 기록했다. 워커 catch-up은 큐 측정 40개 상한으로 5회 성공·0회 실패, 총 510회 사용 후 정상 정지했으며 90초 동안 추가 호출 0으로 중첩 누수가 제거됐다. 다만 Verified 10개·활성 핵심 카테고리 2개·최대 점유율 70%로 공급 게이트는 계속 실패했다. 운영 큐 610개가 5사이클 동안 측정 완료 0개인데도 `attemptedCount > 0`만으로 bounded heavy direct를 계속 막는 starvation을 확인해, 게시 가능한 깊이가 부족하면 최대 120개 direct miner로 반드시 이어지도록 회귀 테스트를 추가했다.
- 2026-07-13 Phase 1C 최종 공급 실측: ① 핵심 카테고리 후보군을 실제 검색 의도 중심으로 재구성하고 ② 네이버 블로그 OpenAPI 문서수 측정을 직렬화해 `012` 속도 제한을 쿼터 소진으로 오인하지 않도록 복구했다. 11개 카테고리 880개 후보에서 행동 의도 원시 랭킹 30개가 나왔지만 기존 A 이상·실측 완전성·발행 가능 품질 게이트를 모두 통과한 신규 후보는 0개였다. 운영은 Verified 10개·활성 핵심 카테고리 2개·최대 점유율 70%로 `PHASE1_VERIFIED_UNDER_40_AFTER_TWO_STRUCTURAL_IMPROVEMENTS` 중단 기준에 해당한다. 임계값·SearchAd ceiling은 완화하지 않으며 Phase 2~6 진입을 보류하고, 검증된 카테고리로 제품 범위를 축소할지 분석 워크플로우 제품으로 전환할지 결정한다.
- 2026-07-14 사용자가 제품 축소 대신 **Phase 2 진입 조건을 충족하는 공급 회복 작업의 계속 진행**을 명시적으로 선택했다. 읽기 전용 운영 캐시 진단 결과, SearchAd PC/모바일 분리 측정만 보강하면 되는 후보가 123개·16개 세부 카테고리에 존재하지만, 현재 레이더가 보드 미달 상태에서 캐시 승격을 건너뛰어 이 재고를 사용하지 못하는 병목을 확인했다. Phase 1D는 이 병목과 측정 큐 출처 문자열 증폭을 먼저 수정하며, Verified 60·활성 코어 10·최대 점유율 18%·완전성 100%·stale/untrusted/unknown 0의 기준과 사람 블라인드 검수는 완화하지 않는다.
- 2026-07-14 Phase 1D 1차 구현: 보드가 보여도 60개 미달이면 캐시 승격을 실행하고, 후단에서 확정 탈락할 후보를 호출 전 판정하며, 현재 Verified가 부족한 코어 정책 키로 분산한다. 운영 캐시 사본의 1사이클 재현은 최대 24회 중 품질 게이트를 통과한 18개만 선택했고, 남은 예산은 신규 결손 카테고리 발굴에 보존했다. 운영 큐 634개의 출처 문자열은 정규화 환산 시 9.58MB→149KB, 최대 487,148자→67자로 축소된다. 현재 캐시만으로 활성 가능한 코어는 5개 수준이므로 10개 달성에는 남은 측정 예산으로 `home_life/realestate/parenting_pet/education_jobs/it_ai` 등 결손 코어 신규 발굴이 계속 필요하다.
- 2026-07-14 운영 공급 게이트 정확성 보정: 총검색량만 있고 PC/모바일 분리 실측 합계가 0인 행 2개가 Verified로 오인되던 결함을 수정했다. 보정 후 운영 수치는 Verified 8/60·활성 코어 2/10·최대 점유율 75%·완전성 80%이며, `untrusted-row-present`를 포함해 자동 게이트는 실패다.
- 2026-07-14 API 재배포 진단에서 startup prewarm이 재시작 5분 뒤 SearchAd 502회를 반복 사용한 정황을 확인했다. 운영 API의 `LEWORD_MOBILE_PREWARM_ON_START=false`를 적용하고 compose 기본값도 false로 고정했으며, 6시간 주기·동시성 1·대상 2개 제한은 유지한다. 쿼터 원장·ceiling은 변경하지 않았다.
- 2026-07-14 Phase 1D 결손 코어 직접 측정 개선: 큐 canary는 사이클당 최대 12개로 유지하되 남은 공유 예산을 범용 heavy direct가 아니라 카테고리 전용 measured probe에 배정한다. 자동차·부동산·생활주거·반려동물·음식·쇼핑뷰티에 자연어 완성형 검색어를 추가하고, 이 완성형 후보는 `공식입장/근황/프로필/인스타` 등 실시간·플랫폼 꼬리를 재조합하지 않는다. 공급 회복 중 traffic-surge 레인도 정지해 같은 예산이 저가치 이슈 후보로 새지 않게 했다. 집중 레이더, 정적 플랜 회귀, 빌드, API 타입체크, 전체 sanity를 통과했으며 운영 워커 재배포 후 실측 수율을 재판정한다.
- Phase 1 실제 통과 판정은 배포 후 Verified 60개, 10개 이상 활성 카테고리, 최대 점유율 18% 이하, 사람 검수 정밀도 90% 이상을 관찰한 뒤 기록한다.

## 1. 승인 및 실행 규칙

- Phase 0부터 Phase 6까지의 구현 범위는 사용자 승인 완료로 간주한다.
- 각 Phase는 별도 재승인 없이 다음 단계로 진행할 수 있다.
- 단, 각 Phase의 자동 진행 조건은 명시된 테스트와 검증 게이트의 실제 통과다.
- 테스트 실패 시 원인을 수정하고 재검증한다.
- 핵심 품질 게이트 실패 시 최대 2회의 구조적 개선을 수행한다.
- 2회 개선 후에도 기준에 도달하지 못하면 결과를 성공으로 포장하지 않고 수치와 원인을 보고한 뒤 중단·축소·전환 중 하나를 결정한다.
- 중단 보고 뒤 사용자가 추가 구조 개선을 명시적으로 선택하면, 새로 실측된 병목을 대상으로 Phase 1 회복 작업을 재개할 수 있다. 이 경우 통과 기준·쿼터 한도·신뢰성 기준을 낮추지 않고 각 반복의 투입량, 수율, 실패 reason code를 다시 기록한다.
- 범위 밖 유료 서비스 구매, 신규 외부 계정, 파괴적 데이터 변경 등 새로운 권한이 필요한 작업은 별도 확인한다.
- 배포 전에는 코드 검증, 운영 상태 검증, 롤백 가능 여부를 모두 확인한다.

## 2. 제품 목표

LEWORD를 단순 키워드 목록이 아니라 다음 기능을 하나의 흐름으로 제공하는 한국 블로거 운영체제로 만든다.

```text
키워드 발견
→ 검증 근거 비교
→ 내 블로그 적합도 판단
→ 저장 및 콘텐츠 브리프
→ 발행
→ 노출·순위·클릭·수익 추적
→ 실제 결과로 다음 추천 개선
```

핵심 제품 약속:

> 사용자가 매일 10분 안에 오늘 발행할 키워드 3개를 고르고, 선택 근거를 확인하고, 실제 성과까지 추적할 수 있게 한다.

## 3. ‘다른 도구보다 좋다’의 검증 가능한 정의

전 세계 검색 데이터의 절대 규모로 Ahrefs·Semrush와 경쟁하지 않는다. LEWORD가 우월성을 증명할 목표 영역은 다음과 같다.

- 한국어 및 네이버 중심의 실제 발행 가능성
- 검색량만이 아닌 SERP 빈자리와 경쟁 문서 약점
- 시장 기회 점수와 내 블로그 적합도 분리
- 키워드에서 콘텐츠 브리프·발행·성과 추적까지의 연결
- 실시간·급상승 키워드의 유효기간 판단
- 추천 결과를 실제 노출·순위·수익 데이터로 재학습
- 사용자가 키워드를 결정하는 시간 단축

우월성 통과 기준:

- 블라인드 사람 검수 정밀도 90% 이상
- 이상 조합 및 유령 키워드 0개
- 동일 조건 경쟁 도구 비교 우승률 60% 이상
- 경쟁 결과에서 찾기 어려운 유효 기회 25% 이상
- 사용자의 키워드 결정 시간 50% 이상 단축

유료 경쟁 도구의 동일 플랜 데이터에 접근할 수 없으면 ‘전체 기능 대비 우월’은 검증 완료로 표시하지 않는다. 이 경우 접근 가능한 동일 조건의 결과만 비교하고 검증 범위를 명시한다.

## 4. 보장 범위와 명확한 한계

### 시스템적으로 보장할 항목

- 측정되지 않은 키워드를 Verified로 표시하지 않는다.
- 모든 Verified 결과에 출처, 측정 시각, 핵심 근거를 저장한다.
- 화면과 API의 점수·등급·근거가 일치한다.
- 장애 시 가짜 수량이나 합성 데이터를 실제 결과처럼 보여주지 않는다.
- 등급 및 점수 산정에 `Math.random()`을 사용하지 않는다.
- CPC 추정은 `profit-golden-keyword-engine.ts`만 단일 소스로 사용한다.
- 특정 카테고리 편중을 스케줄러와 노출 정책에서 제한한다.
- 품질 기준을 통과하지 못한 키워드는 수량 목표 때문에 승격하지 않는다.

### 통계적으로 개선하되 보장할 수 없는 항목

- 검색 상위 노출
- 첫 노출까지 걸리는 시간
- 검색 클릭 및 방문자 증가
- 애드센스·애드포스트·제휴 수익 증가
- 특정 카테고리에서 매일 SSS 키워드 공급

위 결과는 블로그 권위, 콘텐츠 품질, 발행 속도, 계절성, 경쟁자의 행동, 검색엔진 변경 및 실제 Page RPM의 영향을 받는다. 따라서 확률과 기대 범위는 제시하되 수익과 순위를 보장하지 않는다.

## 5. 목표 데이터 구조

### Verified Now

- 검색량·문서수·등급·근거가 모두 검증된 즉시 발행 후보
- 초기 목표 60~80개
- 정밀도 유지가 확인된 이후 120개를 확장 목표로 적용
- 측정 시각, 만료 시각, 재검증 예정 시각 포함
- 지금 발행해야 하는 이유를 한 줄로 설명

### Opportunity Watch

- 가능성은 있지만 추가 검증이 필요한 후보
- 목표 150~300개
- 보류 사유를 명시: SERP 재확인, CPC 재측정, 자동완성 근거 대기, 문서수 갱신 등
- Verified와 동일한 황금키워드로 표현하지 않음

### Surge Radar

- 자동완성·트렌드·실시간 수요 기반의 단기 기회
- 기본 TTL 24~48시간
- 상시형 황금키워드 등급과 분리
- 지금 발행, 12시간 이내 발행, 과열 또는 만료 상태 표시

### 점수 분리

- 시장 기회 점수: 검색 수요, 경쟁, SERP, 수익성, 최신성
- 내 블로그 적합도: 블로그 지수, 기존 콘텐츠, 전문성, 플랫폼, 수익 모델
- 발행 판단: 즉시 발행, 조건부 발행, 감시, 제외

## 6. 핵심 카테고리 정책

초기 12개 핵심 카테고리:

1. 정책·지원금
2. 금융·보험
3. 건강
4. 교육·취업
5. IT·AI
6. 생활·주거
7. 국내외 여행
8. 자동차
9. 부동산
10. 육아·반려동물
11. 음식·레시피
12. 쇼핑·뷰티

연예·방송·스포츠는 기본적으로 Surge Radar에서 운영하고 데이터가 장기성을 증명할 때 상시 재고로 승격한다.

운영 기준:

- 모든 카테고리를 실제로 스캔한다.
- 최근 7일 기준 최소 10개 카테고리에서 Verified를 확보하는 것을 1차 목표로 한다.
- 30일 재고에서는 12개 카테고리 전체의 유효 결과 확보를 목표로 한다.
- 특정 카테고리의 Verified 비중은 18%를 넘지 않게 노출을 제한한다.
- 카테고리별 최소 수량을 맞추기 위해 품질 게이트를 완화하지 않는다.
- 결과가 없는 카테고리는 탭을 숨기지 않고 현재 상태, Watch 수, 다음 스캔 시간을 표시한다.

결정론적 수집 우선순위:

```text
priority =
  categoryDeficit
  + staleness
  + recentYield
  + userDemand
  - expectedQuotaCost
```

## 7. 구현 페이즈

### Phase 0 — 운영 안정성과 데이터 진실성 복구

예상: 2~3일

작업:

- SearchAd 일일 소프트 한도 소진 시 워커를 완전히 휴면시킨다.
- 한국시간 자정 이후 안전하게 재개한다.
- 신규 발굴, 기존 갱신, 실시간 레이더, 실험용 API 예산을 분리한다.
- API 컨테이너 PID 누적 원인을 진단하고 healthcheck를 단일 프로세스 방식으로 교체한다.
- 워커 heartbeat, 마지막 성공 주기, 보드 최신성, 할당량 상태를 health 응답에 추가한다.
- 장애 시 합성 120개 또는 브라우저 후보를 실제 Verified처럼 표시하는 폴백을 제거한다.
- 마지막 정상 데이터는 만료 상태와 함께 읽기 전용으로 제공한다.
- 현재 운영 기준선 리포트를 생성한다.

주요 파일:

- `src/mobile/live-golden-radar.ts`
- `src/utils/searchad-quota-governor.ts`
- `apps/api/src/server.ts`
- `apps/api/docker-compose.production.yml`

완료 게이트:

- 할당량 소진 후 발굴 루프와 고비용 요청이 중지됨
- heartbeat가 2개 주기 이상 지연되면 unhealthy 판정
- API 프로세스와 PID가 장시간 안정적임
- 가짜 보드 수량 폴백 0건
- 관련 단위·통합 테스트 통과

### Phase 1 — 카테고리 공급 엔진과 우월성 1차 증명

예상: 5~8일 구현 + 7~14일 측정

작업:

- `src/mobile/live-golden-category-policy.ts`를 신설해 카테고리 정책을 단일화한다.
- `category-discovery-map.ts`와 실제 레이더 스케줄을 일치시킨다.
- 카테고리 부족량 기반 스케줄러를 구현한다.
- 카테고리별 후보 수, 검증 수, 통과율, 탈락 이유, API 비용을 기록한다.
- 저비용 신호 → SearchAd 배치 → 문서수 → 상위 후보 SERP 분석 순으로 검증 비용을 단계화한다.
- 카테고리별 최근 수율을 사용하되 품질 판정에는 카테고리 보정치를 사용하지 않는다.
- 동일 시간·동일 시드 조건의 경쟁 도구 비교용 데이터셋을 생성한다.
- 출처를 가린 블라인드 검수 보고서를 생성한다.

공급 통과 기준:

- Verified 60개 이상
- Watch 150개 이상
- 최근 7일 10개 이상 카테고리에서 Verified 확보
- 특정 카테고리 비중 18% 이하
- 모든 Verified의 측정·출처 완전성 100%
- 사람 검수 정밀도 90% 이상
- 이상 조합 0개
- 경쟁 비교 우승률 60% 이상 또는 검증 범위 제한 사유 명시

중단 기준:

- 2회 구조 개선 후 Verified 40개 미만
- 특정 카테고리 편중이 계속 30% 이상
- 사람 검수 정밀도 85% 미만
- API 비용과 갱신 주기가 판매 구조상 지속 불가능

Phase 1이 중단 기준에 걸리면 Phase 2~6을 성공 전제로 확장하지 않는다.

### Phase 1D — Phase 2 진입용 공급 회복

목표는 게이트를 낮추는 것이 아니라 기존 실측 재고를 안전하게 Verified로 승격해 Phase 1의 원래 통과 기준을 충족하는 것이다.

작업:

- 보드가 미달이어도 영속 캐시의 완전한 검색량·문서수 원석을 SearchAd PC/모바일 분리 측정 후보로 사용한다.
- 현재 Verified 결손이 큰 코어 정책 키부터 라운드로빈 승격하고, 한 코어 정책의 측정 후보 점유율을 18% 이내로 제한한다.
- 자연어·의도·의미 중복·플랫폼 잔재 게이트를 SearchAd 호출 전에 적용하고, 통과 기준 자체는 완화하지 않는다.
- 반복 결합되는 측정 큐 출처를 원자 토큰으로 정규화해 파일 증폭과 같은 후보의 재측정을 막는다.
- 배포 후 자연 주기에서 SearchAd 사용량, 승격 수율, 카테고리 분포와 실패 reason code를 읽기 전용으로 재측정한다.

진입 판정:

- 자동 공급 게이트 `Verified >= 60`, 최근 7일 활성 코어 `>= 10`, 최대 코어 점유율 `<= 18%`, 측정 완전성 `100%`, stale/untrusted/unknown `0`을 모두 통과한다.
- 전체 Verified 블라인드 검수에서 정밀도 `>= 90%`, malformed `0`, 의미 중복·플랫폼/문장 잔재 `0`을 확인한다.
- 사람 검수 완료 전 `superiorityGate`를 통과로 표시하지 않는다.
- 위 두 판정을 모두 통과한 경우에만 Phase 2 작업을 시작한다.

### Phase 2 — 신뢰 가능한 3단계 재고와 수익 근거

예상: 6~10일

작업:

- Verified / Watch / Surge 계약과 상태 전이 규칙을 구현한다.
- 통과, 보류, 탈락 이유 코드를 표준화한다.
- 목적 태그를 분리한다: 네이버 트래픽, 애드센스/RPM, 제휴·상업성, 실시간 급상승.
- 시장 점수와 개인 적합도를 분리한다.
- CPC, RPM, 예상 클릭 및 수익 시나리오의 근거를 표시한다.
- 수익 예측을 보수·기준·공격 범위로 표시한다.
- 실제 Page RPM이 없으면 추정임을 명확히 표시한다.
- 서버가 화면 표시용 ViewModel을 최종 결정해 프런트엔드의 등급 재해석을 방지한다.
- 데이터 출처, 측정 시각, 만료, 신뢰도를 API에 포함한다.

완료 게이트:

- 상태 전이와 만료 테스트 통과
- CPC SSoT 위반 0건
- API와 UI의 등급·근거 불일치 0건
- 미측정 데이터가 Verified로 노출되는 경우 0건
- 수익 보장으로 오해할 표현 0건

### Phase 3 — 사용자가 매일 쓰는 전문가 UX

예상: 5~8일

첫 화면:

- 오늘 발행 추천 3개
- 이번 주 준비 키워드 7개
- 지금 상승 중인 키워드 10개
- 저장한 키워드의 변화와 만료 알림

작업:

- 플랫폼, 운영 카테고리, 수익 모델, 경험 수준을 받는 온보딩을 추가한다.
- 기본 보기와 전문가 보기를 분리한다.
- 카드에는 결론, 키워드, 한 줄 근거, 최신성, 핵심 지표만 우선 표시한다.
- 상세 보기에는 SERP 빈자리, 경쟁 문서 약점, 수익 시나리오, 콘텐츠 의도, 중복 위험을 표시한다.
- 저장, 비교, 숨김, 숨김 이유, 콘텐츠 브리프 연결을 구현한다.
- 카테고리 탭을 결과 유무와 무관하게 유지한다.
- 무료 공개는 Verified 8~10개, 최소 6개 카테고리로 구성한다.
- 결제벽은 사용자가 저장·비교·브리프 등 실제 가치를 경험한 뒤 노출한다.
- 화면 행동 분석 이벤트를 추가한다.

주요 파일:

- `apps/api/src/pro-web-site.ts`
- `apps/api/src/server.ts`

제품 통과 기준:

- 첫 가치 경험 45초 이내
- 근거 상세 열람률 35% 이상
- 저장 또는 비교 행동률 20% 이상
- 콘텐츠 브리프 시작률 12% 이상
- 무료 미리보기의 카테고리 다양성 기준 충족
- 모바일·데스크톱 핵심 흐름 E2E 통과

### Phase 4 — 발행 결과 추적과 추천 학습

예상: 5~8일 구현 + 최소 28일 성과 관찰

작업:

- 저장 키워드를 콘텐츠 캘린더로 연결한다.
- 콘텐츠 브리프, 제목, 목차, 필수 포함 주제를 연결한다.
- 발행 URL을 등록하고 순위·노출·클릭을 추적한다.
- 첫 노출, 순위 진입, SERP 빈자리 변화, 키워드 만료 알림을 제공한다.
- 성공·실패 결과를 카테고리, 의도, 경쟁 수준, 블로그 적합도별로 집계한다.
- 개인정보와 연결 데이터는 사용자별로 격리한다.
- 실제 성과가 충분히 쌓이기 전에는 학습 결과를 과신하지 않는다.

실제 성과 검증 설계:

- 비교 가능한 블로그에서 최소 40개 글을 발행한다.
- LEWORD 추천군과 일반 발굴군을 사전에 구분한다.
- 28일 동안 Search Console 노출, 클릭, 첫 노출 시간, 상위 30위 진입을 비교한다.
- 애드센스 수익은 최소 100개 글과 60~90일 표본이 쌓인 뒤 판단한다.

성과 통과 기대치:

- 28일 내 검색 노출 발생률이 비교군보다 20%p 이상 높음
- 첫 검색 노출 중앙 시간이 30% 이상 단축
- 상위 30위 진입률이 비교군보다 유의미하게 높음
- 추천 결과의 실패 이유가 추적 가능함

한계:

- 28일 내 수익 통계가 충분하지 않으면 수익 게이트는 ‘관찰 중’으로 유지한다.
- 사용자 또는 운영 블로그의 실제 발행 표본이 없으면 검색 성과 우월성을 통과 처리하지 않는다.

### Phase 5 — SEO·애드센스 유입 허브

예상: 4~7일

작업:

- 12개 카테고리별 서버 렌더링 허브를 구축한다.
- 선정 방법, 데이터 최신성, 카테고리 해설, 일부 지연·축약 결과를 제공한다.
- 품질이 충분한 카테고리 허브만 사이트맵과 내부 링크에 포함한다.
- 키워드 하나마다 얇은 자동 페이지를 대량 생성하지 않는다.
- 무료 사용자가 제품 가치를 확인할 수 있는 근거와 사례를 제공한다.
- 광고 실험은 한 번에 하나씩 수행한다.
- 광고 RPM과 Pro 전환율을 함께 측정한다.
- 실제 성공 사례와 실패·한계를 함께 공개할 수 있는 증거 구조를 만든다.

통과 기준:

- 카테고리 허브의 중복·얇은 콘텐츠 검사 통과
- 구조화 데이터, 메타데이터, 사이트맵 검사 통과
- 광고 적용 전후 성능과 전환율 비교 가능
- 과장된 수익·순위 보장 표현 0건

### Phase 6 — Shadow, Canary, 전체 배포

예상: 3~5일 + 최소 7일 관찰

배포 순서:

1. 기존 결과와 신규 결과를 Shadow Mode로 비교
2. 내부 계정
3. 일부 Pro 사용자
4. 전체 Pro 사용자
5. 무료 공개 화면

관찰 항목:

- API 가용성 99.5% 이상
- 워커 성공 주기 99% 이상
- heartbeat 지연 2주기 미만
- 마지막 정상 보드 데이터 2시간 이내
- 할당량 소진 시 휴면 동작
- 카테고리 분포와 Verified 정밀도
- 저장·브리프·발행 행동
- 오류율, 응답 시간, 컨테이너 자원

롤백 조건:

- Verified 오탐 증가
- API 또는 워커 안정성 악화
- 카테고리 편중 재발
- UI와 API의 등급 불일치
- 데이터 만료 또는 출처 누락

완료 조건:

- 7일 Canary 관찰 기준 충족
- 회귀 테스트와 전체 검증 통과
- 운영 대시보드와 롤백 절차 확인
- 배포 후 공개 API와 실제 화면 스모크 테스트 통과

## 8. 테스트 전략

### 테스트 우선 구현

각 기능은 실패하는 테스트를 먼저 추가한 뒤 최소 구현, 리팩터링, 회귀 검증 순으로 진행한다.

핵심 테스트 대상:

- `src/mobile/live-golden-radar.test.ts`
  - 부족량 스케줄러
  - 품질 완화 없는 카테고리 최소량
  - 할당량 예산 공정성
  - SearchAd circuit breaker
  - Verified/Watch/Surge 전이
  - 결정론적 정렬
- `apps/api/src/pro-web-site-regression.test.ts`
  - 빈 카테고리 탭 유지
  - 무료 8~10개 및 6개 카테고리 다양성
  - 합성 120개 폴백 제거
  - 출처·등급·측정 시각 표시
- `apps/api/src/mobile-api-server.test.ts`
  - API 계약
  - health/readiness
  - 워커 stale 판정
  - 인증과 공개 데이터 축약
- `src/mobile/golden-category-sss-100run.test.ts`
  - 12개 카테고리 생산 분포
  - 반복 실행 결정론
  - 등급 게이트 보존
- `scripts/live-golden-quality-eval.js`
  - 사람 검수 리포트
  - 이상 조합 코퍼스
  - 통과·탈락 사유 분포
- 기존 PRO blueprint, outcomes, commerce 테스트
  - 수익 시나리오 라벨
  - 성과 표본과 신뢰도
  - 퍼널 이벤트 및 개인정보 격리

검증 순서:

```text
변경 영역 집중 테스트
→ npm run build
→ npm run lint
→ npm run test:sanity
→ apps/api typecheck
→ 관련 API·UI E2E
→ npm run verify:all
→ 운영 스모크 및 Canary 관찰
```

테스트 명령은 실제 `package.json`에 존재하는 스크립트를 먼저 확인한 뒤 실행한다. 존재하지 않는 명령을 통과한 것처럼 기록하지 않는다.

## 9. 분석 이벤트와 핵심 지표

필수 이벤트:

- preview_impression
- category_select
- evidence_open
- keyword_compare
- keyword_save
- keyword_dismiss 및 이유
- brief_start / brief_complete
- publish_track
- first_impression
- rank_enter
- login
- checkout
- purchase

North Star:

- 주간 활성 기회 수: 추천 → 저장·브리프·발행·추적으로 이어진 키워드 수
- 결과 North Star: 추천 키워드로 발행한 글이 28일 안에 검색 노출을 얻은 비율

초기 제품 목표:

- D7 재방문율 25% 이상
- 무료 → 로그인 8% 이상
- 로그인 → 유료 전환 3~5% 초기 가설
- 유료 30일 유지율 80% 이상

이 수치는 목표이며 실제 분석 이벤트와 충분한 표본이 없으면 달성으로 표시하지 않는다.

## 10. 주요 위험과 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| SearchAd 일일 할당량 | 검증 수량 제한 | 단계형 검증, 예산 분리, 회로 차단기 |
| 네이버 자동완성·SERP 변경 | 수집기 불안정 | 출처 다변화, 실패 사유, 마지막 정상 데이터 |
| 카테고리별 실제 수요 차이 | 매일 균등 공급 불가 | 주간·30일 재고 기준, 빈 상태 정직하게 표시 |
| CPC와 실제 RPM 차이 | 수익 과대 추정 | 실제 Page RPM 우선, 범위와 신뢰도 표시 |
| 블로그 권위와 글 품질 | 추천 결과 편차 | 시장 점수와 개인 적합도 분리, 대조군 실험 |
| UI 확장으로 엔진 문제 은폐 | 개발비 낭비 | Phase 1 우월성 게이트 전 확장 금지 |
| 경쟁 도구 접근권한 부족 | 우월성 비교 제한 | 동일 플랜 확보 또는 검증 범위 명시 |
| 소표본 성과 착시 | 잘못된 결론 | 최소 표본과 관찰 기간, 신뢰도 표시 |

## 11. 최종 완료 정의

다음 조건을 모두 충족해야 전체 계획을 완료로 기록한다.

- 운영 안정성 및 데이터 진실성 게이트 통과
- Verified 공급과 카테고리 다양성 게이트 통과
- 사람 검수 정밀도 및 이상 조합 기준 통과
- 접근 가능한 동일 조건에서 경쟁 비교 완료
- Verified/Watch/Surge 데이터 계약과 UI 연결 완료
- 저장 → 브리프 → 발행 → 결과 추적 흐름 완료
- 전체 빌드, 타입 검사, 단위·통합·E2E·회귀 테스트 통과
- Canary 운영 기준 통과
- 실제 발행 결과는 표본과 기간에 따라 ‘통과’, ‘관찰 중’, ‘실패’ 중 하나로 명확히 표시
- 미검증 결과를 성공 사례로 홍보하지 않음

## 12. 실패 시 의사결정

전체 범위를 무조건 완주하는 것이 목표가 아니다. 결과가 증명되지 않으면 다음 순서로 판단한다.

1. 데이터 공급 또는 점수 구조의 원인을 최대 2회 개선한다.
2. 특정 카테고리에서만 우월하면 해당 카테고리 전문 제품으로 범위를 축소한다.
3. 추천 우월성은 없고 분석 효율만 좋다면 ‘황금키워드 보장’이 아닌 분석 워크플로우 제품으로 전환한다.
4. 실제 발행 성과 개선과 지속 가능한 비용 구조가 모두 확인되지 않으면 확장 개발을 중단한다.

---

## 이전 계획

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
