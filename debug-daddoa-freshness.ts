
import * as fs from 'fs';
import * as path from 'path';

// keyword-storage.ts의 로직을 모방하여 테스트
function isKeywordValid(keyword: any): boolean {
    if (!keyword.validUntil) return false;
    return new Date(keyword.validUntil) > new Date();
}

const storagePath = path.join(process.cwd(), 'data', 'keywords-storage.json');
if (!fs.existsSync(storagePath)) {
    console.log('Storage file not found');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
const daddoa = data.keywords.find((k: any) => k.keyword.includes('다또아'));

if (daddoa) {
    console.log('--- Daddoa Status ---');
    console.log('Keyword:', daddoa.keyword);
    console.log('CollectedAt:', daddoa.collectedAt);
    console.log('ValidUntil:', daddoa.validUntil);
    console.log('Is Valid (Current Time):', isKeywordValid(daddoa));
    console.log('Grade:', daddoa.grade);
    console.log('SearchVolume:', daddoa.searchVolume);
    console.log('DocumentCount:', daddoa.documentCount);
} else {
    console.log('Daddoa not found in storage.');
}

// 72시간 캡 테스트 시뮬레이션
const oldDate = new Date();
oldDate.setHours(oldDate.getHours() - 100); // 100시간 전
const testKeyword = {
    collectedAt: oldDate.toISOString(),
    validUntil: new Date(oldDate.getTime() + 72 * 60 * 60 * 1000).toISOString()
};

console.log('\n--- Lifetime Cap Simulation ---');
console.log('Collected 100h ago, Valid for 72h');
console.log('Is Valid now?', isKeywordValid(testKeyword)); // should be false
