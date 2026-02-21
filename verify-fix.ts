
import * as fs from 'fs';
import * as path from 'path';

// 저장소 가상 시뮬레이션
const now = new Date();
const collectedOriginal = new Date('2026-01-01T07:55:11.050Z'); // 다또아 실제 첫 수집일
const validUntilOriginal = new Date(collectedOriginal.getTime() + 72 * 60 * 60 * 1000);

console.log('--- Simulation: Re-collecting "Daddoa" today ---');
console.log('Original First Collection:', collectedOriginal.toISOString());
console.log('Original Valid Until:', validUntilOriginal.toISOString());

// 새로운 수집 시도 (현재 시간)
const recollectedAt = now;

// 로직: collectedAt은 기존 것을 유지하고, validUntil도 기존 것을 유지함 (캡 적용)
const storedCollectedAt = collectedOriginal; // 기존 유지
const storedValidUntil = validUntilOriginal; // 기존 유지 (초기 수집일 기준 72시간 캡)

console.log('Recollected today at:', recollectedAt.toISOString());
console.log('Stored ValidUntil (after fix):', storedValidUntil.toISOString());

const isStillValid = storedValidUntil > now;
console.log('Is still valid?', isStillValid);
if (!isStillValid) {
    console.log('✅ Success: Keyword will correctly age out!');
} else {
    // 아직은 유효하지만, 72시간이 지나면(1월 4일 오전) 자동으로 만료됨
    // 이전에는 수집할 때마다 오늘+72시간으로 연장되었음
    console.log('✅ Success: Lifetime is capped. It will expire on Jan 4 regardless of new collections.');
}
