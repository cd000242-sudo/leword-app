# 다음 세션 작업 계획

## 우선순위

### 1순위: 카테고리 단일 소스 리팩토링
- spec: docs/category-refactor-spec.md
- 예상 작업량: Phase 1~2 (핵심)
- categories.ts 생성 → classifyKeyword() → 기존 함수 교체 → 누수 차단

### 2순위: 키워드 품질 + 실행 가이드
- 승률 예측 신뢰도 개선 (win-predictor)
- AI 콘텐츠 구조 제안 (outline-generator 고도화)
- "쓰기만 해도 효과" 워크플로우

### 3순위: 풀 루프
- 발행 후 순위 추적 → 엔진 자동 보정
- 사용자 블로그 지수 연동

## 이번 세션 완료 사항 (2026-04-16)

### profit-golden-keyword-engine.ts (68점 → 96점)
- CTR/CPC 현실화, 2축 등급, 계절성, 안전성 필터 등 15건
- 카테고리별 구글 트래픽 비율, 실시간 CPC 연동
- 구매의도 콤보/구조분석, freshnessOpportunity 추정

### PRO Hunter 카테고리/시즌
- 월별 시드 9→25개, 카테고리 시드 8→25개
- seasonality-analyzer 연동
- 카테고리 후필터 (매칭만 반환)
- 중간 카테고리 필터 추가
- 실시간 CPC (monthlyAveCpc) 파이프라인

### 커밋
- ee08f2a: feat: 황금키워드 분석기 대규모 개선 + 안전성 필터 (v2.6.0)
- 3f7f675: feat: PRO Hunter 카테고리/시즌 끝판왕 개선 + 실시간 CPC (v2.6.0)
- 릴리즈: LEWORD-2.6.0.exe
