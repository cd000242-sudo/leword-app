#!/bin/bash
# scripts/lint-no-direct-sss.sh — v2.49.9 회귀 방지 lint
#
# SSoT 강제: src/ 안에서 'grade = SSS' 같은 직접 할당 검출.
# 현재 mode: WARNING (점진 wire 진행 중 — v2.49.10+ 에서 strict 전환 예정)
#
# 합법 경로:
#   - src/utils/sanity-gate.ts (SSoT 본체)
#   - applySanity('SSS', ...) 통과한 return
#   - 테스트 파일 (__tests__/)
#   - type union 정의 ('SSS' | 'SS' | ...) — false positive 제외
#
# Usage: bash scripts/lint-no-direct-sss.sh [--strict]
# CI: package.json 의 "lint:sss" 로 등록 → v2.49.10+ 에서 build hook 추가.

STRICT_MODE=0
if [ "$1" = "--strict" ]; then
    STRICT_MODE=1
fi

# 직접 할당만 매칭 (type union 제외)
#   매칭 O: `grade = 'SSS'`, `grade: 'SSS',` (object literal 단독), `r.grade = 'SSS'`
#   매칭 X: `'SSS' | 'SS' | 'S'` (type union)
VIOLATIONS=$(grep -rEn "grade[[:space:]]*=[[:space:]]*['\"]SSS['\"]|grade:[[:space:]]*['\"]SSS['\"]," src/ --include="*.ts" \
  | grep -v "src/utils/sanity-gate\.ts" \
  | grep -v "src/utils/__tests__/" \
  | grep -v "applySanity" \
  | grep -v "'SSS' |" \
  | grep -v "\"SSS\" |" || true)

if [ -z "$VIOLATIONS" ]; then
    echo "✅ Direct SSS 할당 위반 없음 (sanity-gate SSoT 100% 준수)"
    exit 0
fi

COUNT=$(echo "$VIOLATIONS" | wc -l)

if [ "$STRICT_MODE" = "1" ]; then
    echo "❌ Direct SSS 할당 발견 (strict mode) — SSoT 우회 위반 $COUNT 건:"
    echo "$VIOLATIONS"
    echo ""
    echo "→ src/utils/sanity-gate.ts 의 applySanity('SSS', sanityResult) 경유로 변경 필요"
    exit 1
fi

# Warning mode (default)
echo "⚠️  Direct SSS 할당 $COUNT 건 발견 (warning, exit 0):"
echo "$VIOLATIONS"
echo ""
echo "→ v2.49.10+ 점진 wire 대상. 모두 wire 완료 후 'bash $0 --strict' 로 전환."
exit 0
