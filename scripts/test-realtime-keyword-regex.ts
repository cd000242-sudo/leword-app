/**
 * 실시간 검색어 정규식 회귀 테스트 (v2.42.43)
 *   "31기 옥순 영호" 같이 숫자+한글 키워드 보호 검증
 */

const year = new Date().getFullYear();

function cleanKeyword(text: string): string {
    return text.trim()
        .replace(/^\d{1,2}\.\s*/, '')           // "1." "31." (점)
        .replace(/^\d+위\s*/, '')                 // "1위" "31위"
        .replace(/\s*(상승|하락|동일)\s*\d*\s*$/i, '')
        .replace(/\s*(new|NEW|신규)\s*$/i, '')
        .replace(/▲|▼|↑|↓/g, '')
        .replace(/^년\s+/, year + '년 ')
        .replace(/\s+/g, ' ')
        .trim();
}

const cases: { input: string; expected: string; note: string }[] = [
    // v2.42.43 핵심 — 숫자+한글 키워드 보호
    { input: '4 31기 옥순 영호', expected: '4 31기 옥순 영호', note: '⚠️ "4 " 만 있고 점 없으면 키워드 일부로 간주 (보수적)' },
    { input: '4. 31기 옥순 영호', expected: '31기 옥순 영호', note: '✅ "4. " 명백한 순위 → strip, 31 살아남음' },
    { input: '31. 기 옥순 영호', expected: '기 옥순 영호', note: '✅ "31. " 순위 → strip (HTML이 그렇게 명시한 경우)' },

    // orphan year
    { input: '년 11일 운세', expected: `${year}년 11일 운세`, note: '✅ orphan year 복원' },
    { input: '1. 년 11일 운세', expected: `${year}년 11일 운세`, note: '✅ 순위 + orphan year 양쪽' },

    // 일반 순위
    { input: '1. 인요한 의원직 사퇴 상승 2', expected: '인요한 의원직 사퇴', note: '✅ 순위 + 변화 strip' },
    { input: '5위 옥순 편집', expected: '옥순 편집', note: '✅ "5위" strip' },
    { input: '12. 레드레드', expected: '레드레드', note: '✅ "12." strip' },

    // edge case
    { input: '나는 솔로', expected: '나는 솔로', note: '✅ 순위 없는 키워드 그대로' },
    { input: '뮬란 NEW', expected: '뮬란', note: '✅ NEW 뒤 제거' },
];

console.log('='.repeat(85));
console.log('🧪 실시간 검색어 정규식 회귀 테스트 (v2.42.43)');
console.log('='.repeat(85));
console.log(`${'입력'.padEnd(30)} | ${'결과'.padEnd(30)} | OK?`);
console.log('-'.repeat(85));

let pass = 0;
for (const c of cases) {
    const got = cleanKeyword(c.input);
    const ok = got === c.expected;
    if (ok) pass++;
    console.log(`${(ok ? '✅' : '❌')} ${c.input.padEnd(28)} | ${got.padEnd(28)} | ${c.note}`);
    if (!ok) console.log(`   기대: "${c.expected}" / 실제: "${got}"`);
}

console.log('-'.repeat(85));
console.log(`${pass === cases.length ? '✅' : '❌'} 통과: ${pass}/${cases.length}`);
console.log('='.repeat(85));
