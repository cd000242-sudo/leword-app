# PRO Hunter 카테고리 시스템 리팩토링 Spec

## 현황 (2026-04-16)

### 문제
- UI 카테고리 45개 vs detectCategory 반환값 20개 → 매핑 불일치
- isKeywordInSelectedCategory에 celeb/drama/self_development 등 9개만 전용 분기
- 나머지 36개 카테고리는 detectCategory fallback → 대부분 매칭 실패
- 카테고리 필터 정확도: **26%**
- ENHANCED_CATEGORY_GOLDEN_KEYWORDS 키와 UI 카테고리 키 불일치

### 누수 경로
1. Deep Mining → isDeepMined 플래그로 카테고리 체크 우회
2. 자동완성 확장 → 2차 필터 이후 실행되어 필터 미적용
3. 2차 필터 폴백 (filtered < 10이면 원본 유지)
4. 3차 필터 보충 (matched < 5이면 비매칭 추가)

## 설계 방향

### 핵심: 단일 소스 카테고리 정의

```typescript
// src/utils/categories.ts (새 파일)

export interface CategoryDefinition {
  id: string;                    // 내부 키 (영문): 'pet_dog'
  label: string;                 // UI 표시명 (한글): '강아지'
  parentId?: string;             // 상위 카테고리: 'pet'
  primaryTokens: string[];       // 강매칭 토큰: ['강아지', '반려견', '애견', '퍼피']
  secondaryTokens: string[];     // 약매칭 토큰: ['산책', '훈련', '미용']
  excludeTokens: string[];       // 제외 토큰: ['강아지풀', '핫도그']
  seeds: string[];               // 시드 키워드 25개+
  profitPatterns: string[];      // 수익화 패턴: ['추천', '비교', '가격']
  minCPC: number;                // 최소 CPC 기준
}

export const CATEGORIES: CategoryDefinition[] = [ ... ];
```

### 매칭 로직

```typescript
// 1. primaryTokens 중 하나라도 포함 → 강매칭 (해당 카테고리 확정)
// 2. secondaryTokens 2개 이상 포함 → 약매칭
// 3. excludeTokens 포함 → 해당 카테고리 제외
// 4. 주/보조 카테고리 2개 반환 → 필터링은 OR 조건

export function classifyKeyword(keyword: string): {
  primary: string;      // 주 카테고리 id
  secondary?: string;   // 보조 카테고리 id (경계 키워드용)
  confidence: number;   // 0~1
}
```

### 경계 키워드 해결

| 키워드 | 주 카테고리 | 보조 | 이유 |
|--------|------------|------|------|
| 반려동물 보험 추천 | pet | finance | "반려동물" primaryToken → pet 확정 |
| 강아지 산책 코스 서울 | pet | travel | "강아지" primaryToken → pet 확정 |
| 고양이 카페 강남 | pet | food | "고양이" primaryToken → pet 확정 |
| 대출 금리 비교 | finance | - | "대출" primaryToken → finance 확정 |

규칙: primaryTokens는 **무조건 해당 카테고리 우선**. secondaryTokens만 매칭된 경우 보조로 할당.

### 적용 범위 (4곳 통일)

1. **UI 드롭다운**: CATEGORIES에서 자동 생성
2. **isKeywordInSelectedCategory**: classifyKeyword() 사용, 45개 if/else 제거
3. **detectCategory**: classifyKeyword()으로 대체
4. **ENHANCED_CATEGORY_GOLDEN_KEYWORDS**: CATEGORIES.seeds 사용, 별도 DB 제거

### 필터 누수 차단

- Deep Mining 결과 → classifyKeyword() 필터 추가
- 자동완성 결과 → classifyKeyword() 필터 추가
- SmartBlock 결과 → classifyKeyword() 필터 추가
- 모든 allKeywords.push 직전에 카테고리 체크

### 서브카테고리 (UI만)

- pet > pet_dog, pet_cat, pet_etc
- finance > finance_invest, finance_saving, finance_loan
- 내부적으로는 parentId로 연결, 필터는 parent OR child 매칭

## 작업 순서

### Phase 1: 단일 소스 구조 (P0)
1. categories.ts 생성 — 45개 카테고리 정의 (tokens, seeds, patterns)
2. classifyKeyword() 함수 구현
3. isKeywordInSelectedCategory를 classifyKeyword()로 교체
4. detectCategory를 classifyKeyword()로 교체

### Phase 2: 누수 차단 (P1)
5. Deep Mining에 카테고리 필터 추가
6. 자동완성에 카테고리 필터 추가
7. SmartBlock에 카테고리 필터 추가
8. 2차/3차 필터 폴백 조건 조정

### Phase 3: 시드 통합 (P1)
9. ENHANCED_CATEGORY_GOLDEN_KEYWORDS를 categories.ts로 마이그레이션
10. MONTHLY_GOLDEN_KEYWORDS 시즌 특화 강화

### Phase 4: UI 개선 (P2)
11. 서브카테고리 UI 추가
12. 비매칭 보충 시 라벨 표시

## 예상 결과
- 카테고리 정확도: 26% → 85~90%
- 경계 키워드 처리: 주/보조 카테고리 OR 매칭으로 누락 방지
- 유지보수: 카테고리 추가 시 categories.ts 1곳만 수정
