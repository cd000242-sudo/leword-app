/**
 * 실측 회귀 비교 도구 — Rich Feed 결과 v2.42.51 vs v2.42.52 diff
 *
 * 목적: 패치 전후 SSS/SS 결과의 false positive(잘못 차단) / false negative(놓침) 측정
 *
 * 사용법:
 *   1) 패치 전 결과 저장: 앱에서 황금키워드 발굴 → JSON 내보내기 → before.json
 *   2) 패치 후 결과 저장: 같은 시드로 발굴 → after.json
 *   3) 이 스크립트 실행: npx ts-node scripts/test-regression-diff.ts before.json after.json
 */

import * as fs from 'fs';
import * as path from 'path';

interface FeedRow {
    keyword: string;
    grade?: string;
    searchVolume?: number;
    documentCount?: number;
    goldenRatio?: number;
}

function loadFeed(filePath: string): FeedRow[] {
    if (!fs.existsSync(filePath)) {
        console.error(`❌ 파일 없음: ${filePath}`);
        process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(raw) ? raw : (raw.rows || raw.keywords || raw.items || []);
}

const beforePath = process.argv[2];
const afterPath = process.argv[3];

if (!beforePath || !afterPath) {
    console.log('사용법: npx ts-node scripts/test-regression-diff.ts <before.json> <after.json>');
    console.log('');
    console.log('각 JSON 파일은 다음 형식 (행 배열):');
    console.log('  [{ keyword, grade, searchVolume, documentCount, goldenRatio }, ...]');
    console.log('또는 { rows: [...] } / { keywords: [...] } / { items: [...] }');
    process.exit(1);
}

const before = loadFeed(beforePath);
const after = loadFeed(afterPath);

console.log('='.repeat(85));
console.log('🔬 Rich Feed 회귀 비교 — before vs after');
console.log('='.repeat(85));
console.log(`Before: ${before.length}건 | After: ${after.length}건`);
console.log('');

// 등급별 카운트
const countByGrade = (rows: FeedRow[]) => {
    const c: Record<string, number> = { SSR: 0, SSS: 0, SS: 0, S: 0, A: 0, B: 0, C: 0, '': 0 };
    rows.forEach(r => { const g = r.grade || ''; c[g] = (c[g] || 0) + 1; });
    return c;
};

const cb = countByGrade(before);
const ca = countByGrade(after);

console.log('등급별 개수 변화:');
['SSR', 'SSS', 'SS', 'S', 'A', 'B'].forEach(g => {
    const b = cb[g] || 0, a = ca[g] || 0, d = a - b;
    const arrow = d > 0 ? '↑' : d < 0 ? '↓' : '=';
    console.log(`  ${g.padEnd(4)} : ${String(b).padStart(4)} → ${String(a).padStart(4)} (${arrow}${Math.abs(d)})`);
});
console.log('');

// keyword set diff
const beforeMap = new Map(before.map(r => [r.keyword, r]));
const afterMap = new Map(after.map(r => [r.keyword, r]));

const onlyInBefore = before.filter(r => !afterMap.has(r.keyword));
const onlyInAfter = after.filter(r => !beforeMap.has(r.keyword));
const both = before.filter(r => afterMap.has(r.keyword));
const gradeChanged = both.filter(r => r.grade !== afterMap.get(r.keyword)!.grade);

console.log(`🚨 Before 에만 있음 (After 에서 사라짐 — false positive 의심): ${onlyInBefore.length}건`);
onlyInBefore.slice(0, 20).forEach(r => {
    console.log(`  - "${r.keyword}" [${r.grade || '-'}] sv=${r.searchVolume || 0} dc=${r.documentCount || 0} ratio=${r.goldenRatio || 0}`);
});
if (onlyInBefore.length > 20) console.log(`  ... (외 ${onlyInBefore.length - 20}건)`);

console.log('');
console.log(`✨ After 에만 있음 (After 에서 새로 추가): ${onlyInAfter.length}건`);
onlyInAfter.slice(0, 20).forEach(r => {
    console.log(`  + "${r.keyword}" [${r.grade || '-'}] sv=${r.searchVolume || 0} dc=${r.documentCount || 0} ratio=${r.goldenRatio || 0}`);
});
if (onlyInAfter.length > 20) console.log(`  ... (외 ${onlyInAfter.length - 20}건)`);

console.log('');
console.log(`🔄 등급 변경: ${gradeChanged.length}건`);
gradeChanged.slice(0, 20).forEach(r => {
    const a = afterMap.get(r.keyword)!;
    console.log(`  ↔ "${r.keyword}" ${r.grade || '-'} → ${a.grade || '-'}`);
});
if (gradeChanged.length > 20) console.log(`  ... (외 ${gradeChanged.length - 20}건)`);

console.log('');
console.log('='.repeat(85));
console.log('📋 판단 가이드:');
console.log('  - Before 에만 있음 (사라짐) = "정상이었는데 차단됨" 가능성 → 도메인 단어면 위험');
console.log('  - After 에만 있음 = "잘못 통과했던 게 차단됨" 또는 "새로 등장한 키워드"');
console.log('  - SSS/SS 변화 ±5% 이내 = 안전, ±10% 이상 = 점검 필요');
console.log('='.repeat(85));
