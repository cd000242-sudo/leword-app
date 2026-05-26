/**
 * scripts/install-git-hooks.js — v2.49.13 git pre-commit hook 설치
 *
 * sanity-gate.ts 의 SSoT 준수 강제. 커밋 전 자동 검증:
 *   1. lint:sss (--strict) — Direct SSS 할당 0 보장
 *   2. test:sanity         — 25 회귀 테스트 통과
 *
 * 설치: node scripts/install-git-hooks.js
 * 우회 (긴급 시): git commit --no-verify
 *
 * Phase D 회귀 방지 — 사용자 메모리 규칙 "추정값 fallback 가드 — 다운스트림 전파" code-level enforcement.
 */

const fs = require('fs');
const path = require('path');

const HOOK_PATH = path.join(__dirname, '..', '.git', 'hooks', 'pre-commit');

const HOOK_CONTENT = `#!/bin/sh
# LEWORD v2.49.13+ pre-commit hook — sanity-gate SSoT 강제
# 자동 설치: node scripts/install-git-hooks.js
# 우회: git commit --no-verify

# Direct SSS 할당 검출 (strict)
bash scripts/lint-no-direct-sss.sh --strict || {
    echo ""
    echo "❌ pre-commit 차단: src/utils/sanity-gate.ts 의 applySanity('SSS', ...) 경유 필수"
    echo "   우회 (긴급): git commit --no-verify"
    exit 1
}

# 회귀 테스트
npm run test:sanity --silent || {
    echo ""
    echo "❌ pre-commit 차단: sanity-gate.test.ts 회귀 발견"
    exit 1
}

exit 0
`;

if (!fs.existsSync(path.dirname(HOOK_PATH))) {
    console.error('❌ .git/hooks 디렉토리 없음 — git repo 가 아닙니다');
    process.exit(1);
}

fs.writeFileSync(HOOK_PATH, HOOK_CONTENT, { mode: 0o755 });
console.log('✅ pre-commit hook 설치됨: .git/hooks/pre-commit');
console.log('   sanity-gate SSoT 강제 — 커밋 시 자동 lint + test 실행');
console.log('   우회 (긴급 시): git commit --no-verify');
