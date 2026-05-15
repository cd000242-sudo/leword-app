/**
 * 연관 키워드 등급 산정 시뮬레이션 — 다양한 sv/dc 입력값으로 SSS/SS/S/A/B 분포 확인
 */

const calculateGrade = (sv: number, dc: number, ratio: number) => {
    if (sv >= 1000 && dc > 0 && dc <= 5000 && ratio >= 5) return 'SSS';
    if (sv >= 500 && dc > 0 && dc <= 10000 && ratio >= 3) return 'SS';
    if (sv >= 300 && ratio >= 2) return 'S';
    if (sv >= 100) return 'A';
    if (sv >= 30) return 'B';
    return 'C';
};

// 가상 결과 — "뉴발란스" 시드의 연관 키워드 예상치
const simulatedResults = [
    { keyword: '뉴발란스', sv: 80000, dc: 50000 },                  // 시드: 비율 1.6, S? 아니 sv>=300+ratio2 = S
    { keyword: '뉴발란스 327', sv: 35000, dc: 8000 },              // 비율 4.4 → SS (sv≥500 + dc≤10000 + ratio≥3)
    { keyword: '뉴발란스 530', sv: 28000, dc: 6500 },              // 비율 4.3 → SS
    { keyword: '뉴발란스 운동화 추천', sv: 5500, dc: 800 },          // 비율 6.9 → SSS (sv≥1000 + dc≤5000 + ratio≥5)
    { keyword: '뉴발란스 990', sv: 12000, dc: 4500 },               // 비율 2.7 → S
    { keyword: '뉴발란스 코디', sv: 8500, dc: 7200 },               // 비율 1.18 → A (sv≥100)
    { keyword: '뉴발란스 992', sv: 4500, dc: 1200 },                // 비율 3.75 → SS
    { keyword: '나이키', sv: 95000, dc: 88000 },                    // 비율 1.07 → S (sv≥300+ratio≥2 fail) → A (sv≥100)
    { keyword: '아디다스', sv: 62000, dc: 71000 },                  // 비율 0.87 → A
    { keyword: '뉴발란스 530 화이트', sv: 1800, dc: 350 },          // 비율 5.14 → SSS
    { keyword: '뉴발란스 데일리', sv: 720, dc: 180 },                // 비율 4.0 → SS (sv≥500+dc≤10000+ratio≥3)
    { keyword: '뉴발란스 키즈', sv: 250, dc: 90 },                  // 비율 2.78 → S? (sv≥300 fail) → A (sv≥100)
    { keyword: '뉴발란스 베이지', sv: 45, dc: 25 },                   // 비율 1.8 → B
    { keyword: '뉴발란스 매장', sv: 2200, dc: 3500 },               // 비율 0.63 → A
];

console.log('='.repeat(95));
console.log('🔗 연관 키워드 등급 산정 시뮬레이션 — "뉴발란스" 시드 예시');
console.log('='.repeat(95));
console.log(`${'키워드'.padEnd(30)} | ${'sv'.padStart(8)} | ${'dc'.padStart(8)} | ${'ratio'.padStart(6)} | 등급`);
console.log('-'.repeat(95));

const counts: Record<string, number> = { SSS: 0, SS: 0, S: 0, A: 0, B: 0, C: 0 };
for (const item of simulatedResults) {
    const ratio = item.dc > 0 ? parseFloat((item.sv / item.dc).toFixed(2)) : 0;
    const grade = calculateGrade(item.sv, item.dc, ratio);
    counts[grade]++;
    const gradeEmoji = grade === 'SSS' ? '🏆' : grade === 'SS' ? '🥇' : grade === 'S' ? '🥈' : grade === 'A' ? '🥉' : grade === 'B' ? '✅' : '⚠️';
    console.log(`${item.keyword.padEnd(30)} | ${item.sv.toLocaleString().padStart(8)} | ${item.dc.toLocaleString().padStart(8)} | ${ratio.toString().padStart(6)} | ${gradeEmoji} ${grade}`);
}

console.log('-'.repeat(95));
console.log(`📊 등급 분포: SSS ${counts.SSS} · SS ${counts.SS} · S ${counts.S} · A ${counts.A} · B ${counts.B} · C ${counts.C}`);
console.log(`✅ 황금 키워드 (SSS+SS): ${counts.SSS + counts.SS}건`);
console.log(`💡 사용자가 "뉴발란스" 한 단어 검색 → 시드 + 연관 ${simulatedResults.length - 1}개 = 총 ${simulatedResults.length}개 노출, 황금 ${counts.SSS + counts.SS}개 발굴`);
console.log('='.repeat(95));
